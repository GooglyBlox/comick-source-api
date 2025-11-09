/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface AtsuMoeSearchHit {
  document: {
    id: string;
    title: string;
    englishTitle?: string;
    poster?: string;
  };
}

interface AtsuMoeSearchResponse {
  hits: AtsuMoeSearchHit[];
}

interface AtsuMoeChapter {
  id: string;
  title: string;
  number: number;
  index: number;
  pageCount: number;
  createdAt: string;
}

interface AtsuMoeChaptersResponse {
  chapters: AtsuMoeChapter[];
  pages: number;
  page: number;
}

export class AtsuMoeScraper extends BaseScraper {
  private readonly BASE_URL = "https://atsu.moe";

  getName(): string {
    return "AtsuMoe";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("atsu.moe");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/manga\/([a-zA-Z0-9]+)/);
    if (!urlMatch) {
      throw new Error("Invalid atsu.moe manga URL");
    }

    const id = urlMatch[1];
    const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${id}&filter=all&sort=desc&page=0`;
    const response = await fetch(chaptersUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch manga info: ${response.status}`);
    }

    const title = id;
    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const { id } = await this.extractMangaInfo(mangaUrl);
    const allChapters: ScrapedChapter[] = [];
    let currentPage = 0;
    let totalPages = 1;

    while (currentPage < totalPages) {
      const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${id}&filter=all&sort=desc&page=${currentPage}`;

      const response = await fetch(chaptersUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch chapters: ${response.status}`);
      }

      const data: AtsuMoeChaptersResponse = await response.json();
      totalPages = data.pages;

      for (const chapter of data.chapters) {
        const chapterUrl = `${this.BASE_URL}/read/${id}/${chapter.id}`;

        allChapters.push({
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          url: chapterUrl,
        });
      }

      currentPage++;

      if (currentPage < totalPages) {
        await this.delay(500);
      }
    }

    return allChapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/collections/manga/documents/search?q=${encodeURIComponent(query)}&limit=12&query_by=title%2CenglishTitle%2CotherNames&query_by_weights=3%2C2%2C1&include_fields=id%2Ctitle%2CenglishTitle%2Cposter&num_typos=4%2C3%2C2`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const data: AtsuMoeSearchResponse = await response.json();
    const results: SearchResult[] = [];

    for (const hit of data.hits) {
      const doc = hit.document;
      const title = doc.englishTitle || doc.title;
      const coverImage = doc.poster
        ? `${this.BASE_URL}${doc.poster}`
        : undefined;

      let latestChapter = 0;
      let lastUpdated = "";
      try {
        const chaptersUrl = `${this.BASE_URL}/api/manga/chapters?id=${doc.id}&filter=all&sort=desc&page=0`;
        const chaptersResponse = await fetch(chaptersUrl, {
          headers: {
            "User-Agent": this.config.userAgent,
            Accept: "application/json",
          },
        });

        if (chaptersResponse.ok) {
          const chaptersData: AtsuMoeChaptersResponse =
            await chaptersResponse.json();
          if (chaptersData.chapters.length > 0) {
            latestChapter = chaptersData.chapters[0].number;
            const createdDate = new Date(chaptersData.chapters[0].createdAt);
            lastUpdated = this.formatRelativeTime(createdDate);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch chapter count for ${doc.id}:`, error);
      }

      results.push({
        id: doc.id,
        title,
        url: `${this.BASE_URL}/manga/${doc.id}`,
        coverImage,
        latestChapter,
        lastUpdated,
      });

      await this.delay(100);
    }

    return results;
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
}
