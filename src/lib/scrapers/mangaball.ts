import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface BallTitle {
  id: string;
  name: string;
  slug: string;
  image?: {
    file?: string;
    cdn_mangaupdates?: string;
  };
  latest_chapter_at?: string;
  updated_at?: string;
}

interface BallChapter {
  id: string;
  lang: string;
  name?: string;
  number: number;
  status?: string;
  created_at?: string;
  group_name?: string;
  group_id?: string;
}

interface BallChapterPage {
  data?: BallChapter[];
  pagination?: { total_pages: number };
}

export class MangaballScraper extends BaseScraper {
  getName(): string {
    return "Mangaball";
  }

  getBaseUrl(): string {
    return "https://mangaball.com";
  }

  canHandle(url: string): boolean {
    return url.includes("mangaball.com");
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.getBaseUrl()}/api/v1${path}`, {
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

  private getTitleId(url: string): string | null {
    const match = url.match(/\/title-detail\/([0-9a-f]{24})/i);
    return match ? match[1] : null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const id = this.getTitleId(url);
    if (!id) throw new Error("Invalid Mangaball URL");

    const data = await this.fetchJson<{ data?: { name?: string } }>(
      `/title/detail/${id}`,
    );
    const title = data.data?.name;

    return { title: title || id, id };
  }

  private fetchChapters(
    id: string,
    page: number,
    limit: number,
  ): Promise<BallChapterPage> {
    return this.fetchJson<BallChapterPage>(
      `/title/chapter-listing?title_id=${id}&page=${page}&limit=${limit}&group_by=flat&sort_order=desc&language=en`,
    );
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const id = this.getTitleId(mangaUrl);
    if (!id) return [];

    try {
      const limit = 1000;
      const first = await this.fetchChapters(id, 1, limit);
      const raw = [...(first.data || [])];
      const totalPages = first.pagination?.total_pages || 1;

      for (let page = 2; page <= totalPages; page++) {
        const next = await this.fetchChapters(id, page, limit);
        raw.push(...(next.data || []));
      }

      const byNumber = new Map<number, BallChapter>();
      for (const chapter of raw) {
        if (chapter.lang !== "en" || chapter.status !== "published") continue;
        if (typeof chapter.number !== "number" || isNaN(chapter.number)) {
          continue;
        }
        if (!byNumber.has(chapter.number)) {
          byNumber.set(chapter.number, chapter);
        }
      }

      return Array.from(byNumber.values())
        .map((chapter) => ({
          id: chapter.id,
          number: chapter.number,
          title: chapter.name || `Chapter ${chapter.number}`,
          url: `${this.getBaseUrl()}/chapter-detail/${chapter.id}`,
          lastUpdated: chapter.created_at,
          group: chapter.group_name
            ? {
                id: chapter.group_id || chapter.group_name,
                name: chapter.group_name,
              }
            : undefined,
        }))
        .sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[Mangaball] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson<{ data?: BallTitle[] }>(
      `/title/search-advanced?keyword=${encodeURIComponent(query)}&limit=20`,
    );

    const titles = (data.data || []).slice(0, 20);

    return Promise.all(
      titles.map(async (title, index) => {
        let latestChapter = 0;

        if (index < 5) {
          try {
            const page = await this.fetchChapters(title.id, 1, 1);
            const number = page.data?.[0]?.number;
            if (typeof number === "number" && !isNaN(number)) {
              latestChapter = number;
            }
          } catch {
            latestChapter = 0;
          }
        }

        const updated = title.latest_chapter_at || title.updated_at || "";
        const timestamp = updated ? new Date(`${updated}Z`).getTime() : NaN;

        return {
          id: title.id,
          title: title.name,
          url: `${this.getBaseUrl()}/title-detail/${title.id}-${title.slug}`,
          coverImage: title.image?.cdn_mangaupdates || title.image?.file,
          latestChapter,
          lastUpdated: updated,
          lastUpdatedTimestamp: isNaN(timestamp) ? undefined : timestamp,
        };
      }),
    );
  }
}
