import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface ReiMangaSearchItem {
  id: number;
  title: string;
  name_url: string;
  chapter_number?: string | null;
  chapter_updated_at?: string | null;
  login_only?: boolean;
}

interface ReiMangaChapter {
  id: number;
  name?: string | null;
  chapter_number: string;
  created_at?: string;
  uploaded?: number;
}

interface ReiMangaChapterPage {
  data: ReiMangaChapter[];
  pagination?: { totalPages?: number };
}

export class ReiMangaScraper extends BaseScraper {
  private readonly BASE_URL = "https://reimanga.net";
  private readonly API_URL = "https://reimanga.net/api";

  getName(): string {
    return "ReiManga";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("reimanga.net") || url.includes("reimanga.com");
  }

  getType(): SourceType {
    return "aggregator";
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Math.max(0, Date.now() - date.getTime());
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
    const response = await fetch(`${this.API_URL}${path}`, {
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

  private parseMangaUrl(url: string): { slug: string; id: string } | null {
    const match = url.match(/\/manga\/(?:([^/?#]+)-)?(\d+)(?:[/?#]|$)/);
    if (!match) return null;
    return { slug: match[1] || "", id: match[2] };
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const parsed = this.parseMangaUrl(url);
    if (!parsed) throw new Error("Could not extract manga id from URL");

    const data = await this.getJson<{ manga: { title: string } }>(
      `/manga/${parsed.id}`,
    );
    return { title: data.manga.title, id: parsed.id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const parsed = this.parseMangaUrl(mangaUrl);
    if (!parsed) return [];

    try {
      const all: ReiMangaChapter[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const result = await this.getJson<ReiMangaChapterPage>(
          `/chapters/manga/${parsed.id}?limit=5000&page=${page}`,
        );
        all.push(...(result.data || []));
        totalPages = result.pagination?.totalPages || 1;
        page++;
      } while (page <= totalPages && page <= 10);

      const mangaPath = `${this.BASE_URL}/manga/${parsed.slug ? `${parsed.slug}-` : ""}${parsed.id}`;
      const byNumber = new Map<number, ScrapedChapter>();

      for (const chapter of all) {
        if (chapter.uploaded === 0) continue;
        const number = parseFloat(chapter.chapter_number);
        if (isNaN(number) || number < 0) continue;
        if (byNumber.has(number)) continue;

        const date = chapter.created_at ? new Date(chapter.created_at) : null;
        byNumber.set(number, {
          id: String(chapter.id),
          number,
          title: chapter.name?.trim() || undefined,
          url: `${mangaPath}/${chapter.id}`,
          lastUpdated:
            date && !isNaN(date.getTime())
              ? this.formatRelativeTime(date)
              : undefined,
        });
      }

      return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[ReiManga] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.getJson<{ data: ReiMangaSearchItem[] }>(
        `/manga/search/advanced?esOnly=1&page=1&limit=20&title=${encodeURIComponent(query)}`,
      );

      return (data.data || [])
        .filter((item) => !item.login_only)
        .slice(0, 20)
        .map((item) => {
          const date = item.chapter_updated_at
            ? new Date(item.chapter_updated_at)
            : null;
          const valid = date && !isNaN(date.getTime()) ? date : null;
          const latest = parseFloat(item.chapter_number || "");

          return {
            id: `${item.name_url}-${item.id}`,
            title: item.title,
            url: `${this.BASE_URL}/manga/${item.name_url}-${item.id}`,
            coverImage: `${this.BASE_URL}/covers/${item.id}/thumbnail.webp`,
            latestChapter: isNaN(latest) ? 0 : latest,
            lastUpdated: valid ? this.formatRelativeTime(valid) : "",
            lastUpdatedTimestamp: valid ? valid.getTime() : undefined,
          };
        });
    } catch (error) {
      console.error("[ReiManga] Search error:", error);
      return [];
    }
  }
}
