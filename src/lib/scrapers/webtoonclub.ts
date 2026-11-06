import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface ApiSearchItem {
  id: number;
  title: string;
  slug: string;
  cover_thumb?: string;
}

interface ApiChapter {
  id: number;
  chapterNumber: string;
  title: string | null;
  slug: string;
  date?: string;
}

export class WebtoonClubScraper extends BaseScraper {
  private readonly BASE_URL = "https://webtoonclub.com";

  getName(): string {
    return "WebtoonClub";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("webtoonclub.com");
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${path}`, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private getSlug(url: string): string | null {
    const match = url.match(/\/webtoon\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  private async getChapters(comicId: number): Promise<ApiChapter[]> {
    const data = await this.getJson<{ chapters?: ApiChapter[] }>(
      `/api/comics/${comicId}/chapters`,
    );
    return data.chapters || [];
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);
    if (!slug) throw new Error("Invalid WebtoonClub URL");

    const html = await this.fetchWithRetry(`${this.BASE_URL}/webtoon/${slug}`);
    const match = html.match(/<title>([^<]*)<\/title>/i);
    const title = match
      ? match[1]
          .replace(/\s*\|\s*WebtoonClub\s*$/i, "")
          .replace(/\s+(Manhwa|Manga|Manhua|Webtoon)\b.*$/i, "")
          .replace(/&amp;/g, "&")
          .replace(/&#x27;|&#39;/g, "'")
          .trim()
      : slug;

    return { title, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);
    if (!slug) return [];

    try {
      const html = await this.fetchWithRetry(
        `${this.BASE_URL}/webtoon/${slug}`,
      );
      const idMatch = html.match(/comicId[\\"]+:(\d+)/);
      if (!idMatch) return [];

      const items = await this.getChapters(parseInt(idMatch[1], 10));
      const byNumber = new Map<number, ScrapedChapter>();

      for (const item of items) {
        const number = parseFloat(item.chapterNumber);
        if (isNaN(number) || byNumber.has(number)) continue;

        byNumber.set(number, {
          id: `${number}`,
          number,
          title: item.title || `Chapter ${number}`,
          url: `${this.BASE_URL}/webtoon/${slug}/chapter/${item.slug.replace(/^chapter-/, "")}`,
          lastUpdated: item.date,
        });
      }

      return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[WebtoonClub] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    if (query.trim().length < 2) {
      return [];
    }

    const data = await this.getJson<{ results?: ApiSearchItem[] }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    );

    const items = (data.results || []).slice(0, 20);

    return Promise.all(
      items.map(async (item, index) => {
        let latestChapter = 0;
        let lastUpdated = "";
        let lastUpdatedTimestamp: number | undefined;

        if (index < 5) {
          try {
            const chapters = await this.getChapters(item.id);
            for (const chapter of chapters) {
              const number = parseFloat(chapter.chapterNumber);
              if (!isNaN(number) && number > latestChapter) {
                latestChapter = number;
                if (chapter.date) {
                  lastUpdated = chapter.date;
                  lastUpdatedTimestamp = new Date(chapter.date).getTime();
                }
              }
            }
          } catch (error) {
            console.error("[WebtoonClub] Latest chapter fetch error:", error);
          }
        }

        return {
          id: item.slug,
          title: item.title,
          url: `${this.BASE_URL}/webtoon/${item.slug}`,
          coverImage: item.cover_thumb
            ? `${this.BASE_URL}/uploads/${item.cover_thumb}`
            : undefined,
          latestChapter,
          lastUpdated,
          lastUpdatedTimestamp,
        };
      }),
    );
  }
}
