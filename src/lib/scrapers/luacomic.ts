/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface LuaComicChapter {
  id: number;
  chapter_name: string;
  chapter_title: string | null;
  chapter_slug: string;
  price: number;
  created_at: string;
  series: {
    series_slug: string;
    id: number;
  };
}

interface LuaComicSearchResult {
  id: number;
  title: string;
  series_slug: string;
  thumbnail: string;
  status: string;
  rating?: number;
  free_chapters?: Array<{
    id: number;
    chapter_name: string;
    chapter_slug: string;
    created_at: string;
  }>;
  paid_chapters?: Array<{
    id: number;
    chapter_name: string;
    chapter_slug: string;
    created_at: string;
  }>;
  meta?: {
    chapters_count?: string;
  };
}

interface LuaComicApiResponse<T> {
  data: T[];
  meta: {
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
    first_page: number;
    first_page_url: string;
    last_page_url: string;
    next_page_url: string | null;
    previous_page_url: string | null;
  };
}

export class LuaComicScraper extends BaseScraper {
  private readonly BASE_URL = "https://luacomic.org";
  private readonly API_URL = "https://api.luacomic.org";

  getName(): string {
    return "Lua Comic";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("luacomic.org");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/series\/([^/]+)/);
    if (!urlMatch) {
      throw new Error("Invalid Lua Comic URL");
    }

    const seriesSlug = urlMatch[1];

    try {
      const searchUrl = `${this.API_URL}/query?page=1&perPage=5&series_type=Comic&query_string=${encodeURIComponent(seriesSlug)}&orderBy=created_at&adult=true&status=All&tags_ids=%5B%5D`;
      const response = await fetch(searchUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": this.config.userAgent,
          Referer: `${this.BASE_URL}/`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: LuaComicApiResponse<LuaComicSearchResult> =
        await response.json();

      if (data.data && data.data.length > 0) {
        const series = data.data.find((s) => s.series_slug === seriesSlug);
        if (series) {
          return {
            title: series.title,
            id: series.id.toString(),
          };
        }
      }
    } catch (error) {
      console.error("[Lua Comic] Failed to fetch series info:", error);
    }

    return {
      title: seriesSlug.replace(/-/g, " "),
      id: seriesSlug,
    };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const urlMatch = mangaUrl.match(/\/series\/([^/]+)/);
      if (!urlMatch) {
        throw new Error("Invalid Lua Comic URL");
      }

      const seriesSlug = urlMatch[1];

      const searchUrl = `${this.API_URL}/query?page=1&perPage=5&series_type=Comic&query_string=${encodeURIComponent(seriesSlug)}&orderBy=created_at&adult=true&status=All&tags_ids=%5B%5D`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": this.config.userAgent,
          Referer: `${this.BASE_URL}/`,
        },
      });

      if (!searchResponse.ok) {
        throw new Error(`HTTP ${searchResponse.status}`);
      }

      const searchData: LuaComicApiResponse<LuaComicSearchResult> =
        await searchResponse.json();
      const series = searchData.data.find((s) => s.series_slug === seriesSlug);

      if (!series) {
        throw new Error("Series not found");
      }

      const seriesId = series.id;

      let currentPage = 1;
      let hasMorePages = true;
      const perPage = 100;

      while (hasMorePages) {
        const chaptersUrl = `${this.API_URL}/chapter/query?page=${currentPage}&perPage=${perPage}&query=&order=desc&series_id=${seriesId}`;
        const chaptersResponse = await fetch(chaptersUrl, {
          headers: {
            Accept: "application/json, text/plain, */*",
            "User-Agent": this.config.userAgent,
            Referer: `${this.BASE_URL}/`,
          },
        });

        if (!chaptersResponse.ok) {
          throw new Error(`HTTP ${chaptersResponse.status}`);
        }

        const chaptersData: LuaComicApiResponse<LuaComicChapter> =
          await chaptersResponse.json();

        for (const chapter of chaptersData.data) {
          if (chapter.price > 0) {
            continue;
          }

          const chapterNumber = this.extractChapterNumberFromName(
            chapter.chapter_name
          );

          if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
            seenChapterNumbers.add(chapterNumber);

            const chapterUrl = `${this.BASE_URL}/series/${chapter.series.series_slug}/${chapter.chapter_slug}`;
            const title = chapter.chapter_title
              ? `${chapter.chapter_name} - ${chapter.chapter_title}`
              : chapter.chapter_name;

            chapters.push({
              id: chapter.id.toString(),
              number: chapterNumber,
              title,
              url: chapterUrl,
              lastUpdated: new Date(chapter.created_at).toLocaleDateString(),
            });
          }
        }

        hasMorePages = currentPage < chaptersData.meta.last_page;
        currentPage++;
      }
    } catch (error) {
      console.error("[Lua Comic] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  private extractChapterNumberFromName(chapterName: string): number {
    const match = chapterName.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
    return match ? parseFloat(match[1]) : -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.API_URL}/query?page=1&perPage=20&series_type=Comic&query_string=${encodeURIComponent(query)}&orderBy=created_at&adult=true&status=All&tags_ids=%5B%5D`;
      const response = await fetch(searchUrl, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": this.config.userAgent,
          Referer: `${this.BASE_URL}/`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: LuaComicApiResponse<LuaComicSearchResult> =
        await response.json();

      const results: SearchResult[] = [];

      const limitedResults = data.data.slice(0, 5);

      for (const series of limitedResults) {
        let latestChapter = 0;
        let lastUpdated = "";
        let lastUpdatedTimestamp: number | undefined;

        if (series.free_chapters && series.free_chapters.length > 0) {
          const latestFreeChapter = series.free_chapters[0];
          const chapterNumber = this.extractChapterNumberFromName(
            latestFreeChapter.chapter_name
          );
          if (chapterNumber > latestChapter) {
            latestChapter = chapterNumber;
            lastUpdated = new Date(
              latestFreeChapter.created_at
            ).toLocaleDateString();
            lastUpdatedTimestamp = new Date(
              latestFreeChapter.created_at
            ).getTime();
          }
        }

        results.push({
          id: series.id.toString(),
          title: series.title,
          url: `${this.BASE_URL}/series/${series.series_slug}`,
          coverImage: series.thumbnail,
          latestChapter,
          lastUpdated,
          lastUpdatedTimestamp,
          rating: series.rating,
        });
      }

      return results;
    } catch (error) {
      console.error("[Lua Comic] Search error:", error);
      throw error;
    }
  }
}
