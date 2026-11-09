import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface NyxScansChapter {
  number: number;
  slug: string;
  title?: string;
  createdAt?: string;
  isLocked?: boolean;
  isAccessible?: boolean;
}

interface NyxScansPost {
  id: number;
  slug: string;
  postTitle: string;
  seriesType?: string;
  featuredImage?: string;
  averageRating?: number;
  chapters?: NyxScansChapter[];
}

export class NyxScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://nyxscans.com";
  private readonly API_URL = "https://api.nyxscans.com";
  private readonly PAGE_SIZE = 200;

  getName(): string {
    return "Nyx Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("nyxscans.com");
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private slugFromUrl(url: string): string {
    const match = url.match(/\/series\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.slugFromUrl(url);

    if (slug) {
      try {
        const data = await this.fetchJson<{ post?: NyxScansPost }>(
          `${this.API_URL}/api/post?postSlug=${encodeURIComponent(slug)}`,
        );
        if (data.post?.postTitle) {
          return { title: data.post.postTitle, id: slug };
        }
      } catch (error) {
        console.error("[Nyx Scans] Post fetch error:", error);
      }
    }

    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);
    const title =
      $("h1").first().text().trim() || $("title").text().split(" - ")[0].trim();

    return { title, id: slug || Date.now().toString() };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.slugFromUrl(mangaUrl);
    if (!slug) return [];

    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const postData = await this.fetchJson<{
        post?: { id: number };
        totalChapterCount?: number;
      }>(`${this.API_URL}/api/post?postSlug=${encodeURIComponent(slug)}`);

      const postId = postData.post?.id;
      if (!postId) return [];

      const total = postData.totalChapterCount ?? 0;

      for (let skip = 0; skip < Math.max(total, 1); skip += this.PAGE_SIZE) {
        const data = await this.fetchJson<{
          post?: { chapters?: NyxScansChapter[] };
        }>(
          `${this.API_URL}/api/chapters?postId=${postId}&skip=${skip}&take=${this.PAGE_SIZE}&order=asc`,
        );

        const page = data.post?.chapters ?? [];

        for (const chapter of page) {
          if (chapter.isLocked || chapter.isAccessible === false) continue;
          if (
            typeof chapter.number !== "number" ||
            chapter.number < 0 ||
            seenChapterNumbers.has(chapter.number)
          ) {
            continue;
          }

          seenChapterNumbers.add(chapter.number);
          chapters.push({
            id: `${chapter.number}`,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            url: `${this.BASE_URL}/series/${slug}/${chapter.slug}`,
            lastUpdated: chapter.createdAt,
          });
        }

        if (page.length < this.PAGE_SIZE) break;
      }
    } catch (error) {
      console.error("[Nyx Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson<{ posts?: NyxScansPost[] }>(
      `${this.API_URL}/api/query?page=1&perPage=20&searchTerm=${encodeURIComponent(query)}`,
    );

    return (data.posts ?? [])
      .filter((post) => post.seriesType !== "NOVEL")
      .slice(0, 20)
      .map((post) => {
        let latestChapter = 0;
        let latestDate: string | undefined;

        for (const chapter of post.chapters ?? []) {
          if (chapter.isLocked || chapter.isAccessible === false) continue;
          if (chapter.number > latestChapter) {
            latestChapter = chapter.number;
            latestDate = chapter.createdAt;
          }
        }

        const parsed = latestDate ? new Date(latestDate).getTime() : NaN;

        return {
          id: post.slug,
          title: post.postTitle,
          url: `${this.BASE_URL}/series/${post.slug}`,
          coverImage: post.featuredImage || undefined,
          latestChapter,
          lastUpdated: latestDate
            ? new Date(latestDate).toLocaleDateString()
            : "",
          lastUpdatedTimestamp: isNaN(parsed) ? undefined : parsed,
          rating: post.averageRating,
        };
      });
  }
}
