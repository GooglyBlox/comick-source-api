import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface QiScansChapter {
  id: number;
  slug: string;
  number: number;
  title: string | null;
  createdAt: string;
  requiresPurchase?: boolean;
}

interface QiScansSearchItem {
  id: number;
  slug: string;
  title: string;
  cover?: string | null;
}

interface QiScansDetail {
  id: number;
  slug: string;
  title: string;
  cover?: string | null;
  lastChapterAddedAt?: string | null;
  createdAt?: string;
  stats?: { averageRating?: number | null; chapterCount?: number };
}

interface QiScansChapterPage {
  data: QiScansChapter[];
  totalPages: number;
}

export class QiScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://qimanga.com";
  private readonly API_URL = "https://api.qimanga.com/api/v1";

  getName(): string {
    return "Qi Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return (
      url.includes("qiscans.org") ||
      url.includes("qimanhwa.com") ||
      url.includes("qimanga.com")
    );
  }

  getType(): SourceType {
    return "scanlator";
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
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
    const response = await fetch(`${this.API_URL}${path}`, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        Origin: this.BASE_URL,
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
    return match ? match[1] : "";
  }

  private async getLatestChapter(slug: string): Promise<number> {
    const page = await this.getJson<QiScansChapterPage>(
      `/series/${slug}/chapters?page=1&perPage=20`,
    );
    const readable = (page.data || []).filter((ch) => !ch.requiresPurchase);
    return readable.length > 0
      ? Math.max(...readable.map((ch) => ch.number))
      : 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.getJson<{ data?: QiScansSearchItem[] }>(
        `/series/search?q=${encodeURIComponent(query)}`,
      );
      const items = (data.data || []).slice(0, 5);

      return await Promise.all(
        items.map(async (item) => {
          let latestChapter = 0;
          let updated: Date | null = null;
          let rating: number | undefined;

          const [detail, latest] = await Promise.all([
            this.getJson<QiScansDetail>(`/series/${item.slug}`).catch(
              () => null,
            ),
            this.getLatestChapter(item.slug).catch(() => 0),
          ]);

          latestChapter = latest;
          if (detail) {
            const stamp = detail.lastChapterAddedAt || detail.createdAt;
            updated = stamp ? new Date(stamp) : null;
            rating = detail.stats?.averageRating || undefined;
            if (!latestChapter) {
              latestChapter = detail.stats?.chapterCount || 0;
            }
          }

          return {
            id: item.id.toString(),
            title: item.title,
            url: `${this.BASE_URL}/series/${item.slug}`,
            coverImage: item.cover || undefined,
            latestChapter,
            lastUpdated: updated ? this.formatRelativeTime(updated) : "",
            lastUpdatedTimestamp: updated ? updated.getTime() : undefined,
            rating,
          };
        }),
      );
    } catch (error) {
      console.error("QiScans search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);

    if (!slug) {
      throw new Error("Could not extract manga slug from URL");
    }

    const detail = await this.getJson<QiScansDetail>(`/series/${slug}`);

    return { title: detail.title, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const slug = this.getSlug(mangaUrl);

      if (!slug) {
        throw new Error("Could not extract manga slug from URL");
      }

      const first = await this.getJson<QiScansChapterPage>(
        `/series/${slug}/chapters?page=1&perPage=100`,
      );
      const rest = await Promise.all(
        Array.from(
          { length: Math.max(0, (first.totalPages || 1) - 1) },
          (_, i) =>
            this.getJson<QiScansChapterPage>(
              `/series/${slug}/chapters?page=${i + 2}&perPage=100`,
            ),
        ),
      );

      const seen = new Set<number>();
      const result: ScrapedChapter[] = [];

      for (const chapter of [first, ...rest].flatMap((p) => p.data || [])) {
        if (chapter.requiresPurchase || seen.has(chapter.number)) {
          continue;
        }
        seen.add(chapter.number);

        result.push({
          id: chapter.id.toString(),
          number: chapter.number,
          title: chapter.title || undefined,
          url: `${this.BASE_URL}/series/${slug}/${chapter.slug}`,
          lastUpdated: this.formatRelativeTime(new Date(chapter.createdAt)),
        });
      }

      return result.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("QiScans chapter list error:", error);
      throw error;
    }
  }
}
