import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface SuggestItem {
  id: string;
  title: string;
  path: string;
  thumbnail?: string;
}

interface ReaderChapter {
  id: string;
  slug: string;
  title: string;
  date?: string;
  path: string;
}

interface ReaderChapters {
  items: ReaderChapter[];
  page: number;
  hasMore: boolean;
  total: number;
}

export class TopManhuaScraper extends BaseScraper {
  getName(): string {
    return "TopManhua";
  }

  getBaseUrl(): string {
    return "https://manhuatop.org";
  }

  canHandle(url: string): boolean {
    return url.includes("manhuatop.org");
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
        Referer: `${this.getBaseUrl()}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private getSlug(url: string): string | null {
    const match = url.match(/\/manhua\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    return { title, id: this.getSlug(url) || Date.now().toString() };
  }

  private async fetchChapterPage(
    slug: string,
    page: number,
  ): Promise<ReaderChapters> {
    const path = `/manhua/${slug}/?tab=chapters${page > 1 ? `&chapter_page=${page}` : ""}`;
    return this.fetchJson<ReaderChapters>(
      `${this.getBaseUrl()}/api/reader?resource=chapters&path=${encodeURIComponent(path)}`,
    );
  }

  private parseChapterNumber(chapter: ReaderChapter): number {
    const match =
      chapter.slug.match(/chapter-(\d+)(?:-(\d+))?/i) ||
      chapter.title.match(/chapter\s+(\d+)(?:\.(\d+))?/i);
    if (!match) return -1;
    return match[2] ? parseFloat(`${match[1]}.${match[2]}`) : parseInt(match[1], 10);
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);
    if (!slug) return [];

    const chapters: ScrapedChapter[] = [];
    const seen = new Set<number>();

    try {
      const first = await this.fetchChapterPage(slug, 1);
      const pages: ReaderChapters[] = [first];

      if (first.hasMore && first.items.length > 0) {
        const totalPages = Math.ceil(first.total / first.items.length);
        const batchSize = 10;
        for (let start = 2; start <= totalPages; start += batchSize) {
          const batch: Promise<ReaderChapters>[] = [];
          for (let p = start; p < start + batchSize && p <= totalPages; p++) {
            batch.push(this.fetchChapterPage(slug, p));
          }
          pages.push(...(await Promise.all(batch)));
        }
      }

      for (const page of pages) {
        for (const item of page.items) {
          const number = this.parseChapterNumber(item);
          if (number < 0 || seen.has(number)) continue;
          seen.add(number);
          chapters.push({
            id: `${number}`,
            number,
            title: item.title,
            url: new URL(item.path, this.getBaseUrl()).toString(),
            lastUpdated: item.date,
          });
        }
      }
    } catch (error) {
      console.error("[TopManhua] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson<{ items: SuggestItem[] }>(
      `${this.getBaseUrl()}/api/search/suggest?q=${encodeURIComponent(query)}`,
    );

    const items = (data.items || []).slice(0, 5);

    return Promise.all(
      items.map(async (item) => {
        const slug = this.getSlug(item.path) || "";
        let latestChapter = 0;
        let lastUpdated = "";
        let lastUpdatedTimestamp: number | undefined;

        try {
          const page = await this.fetchChapterPage(slug, 1);
          const numbers = page.items
            .map((chapter) => this.parseChapterNumber(chapter))
            .filter((n) => n >= 0);
          if (numbers.length > 0) latestChapter = Math.max(...numbers);
          const date = page.items[0]?.date;
          if (date) {
            lastUpdated = date;
            lastUpdatedTimestamp = new Date(date).getTime();
          }
        } catch (error) {
          console.error("[TopManhua] Latest chapter fetch error:", error);
        }

        return {
          id: slug,
          title: item.title,
          url: new URL(item.path, this.getBaseUrl()).toString(),
          coverImage: item.thumbnail,
          latestChapter,
          lastUpdated,
          lastUpdatedTimestamp,
        };
      }),
    );
  }
}
