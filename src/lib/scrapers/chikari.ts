import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface ChikariSeries {
  id: number;
  slug: string;
  title: string;
  cover_url?: string | null;
  latest_chapter?: number | null;
  last_chapter_at?: string | null;
  rating?: number | null;
  is_nsfw?: boolean;
}

interface ChikariChapter {
  number: number;
  title?: string | null;
  lang?: string;
  created_at?: string;
  scans?: { id?: number | string; name?: string }[];
}

interface ChikariChapterPage {
  items: ChikariChapter[];
  total: number;
  limit: number;
}

export class ChikariScraper extends BaseScraper {
  private readonly BASE_URL = "https://chikari.moe";
  private readonly PAGE_SIZE = 200;

  getName(): string {
    return "Chikari";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("chikari.moe");
  }

  getType(): SourceType {
    return "aggregator";
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}y ago`;
    if (diffMonths > 0) return `${diffMonths}mo ago`;
    if (diffWeeks > 0) return `${diffWeeks}w ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "just now";
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
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private getSlug(url: string): string {
    const match = url.match(/\/series\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.getJson<ChikariSeries[]>(
        `/api/search?q=${encodeURIComponent(query)}`,
      );

      return (Array.isArray(data) ? data : []).slice(0, 20).map((item) => {
        const updated = item.last_chapter_at
          ? new Date(item.last_chapter_at)
          : null;

        return {
          id: item.slug,
          title: item.title,
          url: `${this.BASE_URL}/series/${item.slug}`,
          coverImage: item.cover_url || undefined,
          latestChapter: item.latest_chapter || 0,
          lastUpdated: updated ? this.formatRelativeTime(updated) : "",
          lastUpdatedTimestamp: updated ? updated.getTime() : undefined,
          rating: item.rating || undefined,
        };
      });
    } catch (error) {
      console.error("[Chikari] search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);

    if (!slug) {
      throw new Error("Could not extract manga slug from URL");
    }

    const detail = await this.getJson<ChikariSeries>(
      `/api/series/${encodeURIComponent(slug)}`,
    );

    return { title: detail.title, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const slug = this.getSlug(mangaUrl);

      if (!slug) {
        throw new Error("Could not extract manga slug from URL");
      }

      const path = (offset: number) =>
        `/api/series/${encodeURIComponent(slug)}/chapters?limit=${this.PAGE_SIZE}&offset=${offset}`;

      const first = await this.getJson<ChikariChapterPage>(path(0));
      const pageSize = first.limit || this.PAGE_SIZE;
      const offsets: number[] = [];
      for (let o = pageSize; o < (first.total || 0); o += pageSize) {
        offsets.push(o);
      }
      const rest = await Promise.all(
        offsets.map((o) => this.getJson<ChikariChapterPage>(path(o))),
      );

      const seen = new Set<number>();
      const result: ScrapedChapter[] = [];

      for (const chapter of [first, ...rest].flatMap((p) => p.items || [])) {
        if (chapter.lang && chapter.lang !== "en") continue;
        if (typeof chapter.number !== "number" || seen.has(chapter.number)) {
          continue;
        }
        seen.add(chapter.number);

        const scan = chapter.scans?.find((x) => x.name);

        result.push({
          id: chapter.number.toString(),
          number: chapter.number,
          title: chapter.title || undefined,
          url: `${this.BASE_URL}/series/${slug}/${chapter.number}`,
          lastUpdated: chapter.created_at
            ? this.formatRelativeTime(new Date(chapter.created_at))
            : undefined,
          group: scan?.name
            ? { id: String(scan.id ?? scan.name), name: scan.name }
            : undefined,
        });
      }

      return result.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[Chikari] chapter list error:", error);
      throw error;
    }
  }
}
