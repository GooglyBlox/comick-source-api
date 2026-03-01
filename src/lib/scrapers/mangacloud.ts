/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MangaCloudScraper extends BaseScraper {
  private readonly BASE_URL = "https://mangacloud.org";
  private readonly API_URL = "https://api.mangacloud.org";

  getName(): string {
    return "MangaCloud";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("mangacloud.org");
  }

  getType(): SourceType {
    return "aggregator";
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const response = await fetch(`${this.API_URL}/comic/browse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "*/*",
          "Origin": this.BASE_URL,
          "Referer": `${this.BASE_URL}/`,
          "User-Agent": this.config.userAgent,
        },
        body: JSON.stringify({ title: query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      if (data.data && Array.isArray(data.data)) {
        const limitedResults = data.data.slice(0, 5);

        for (const manga of limitedResults) {
          const comicId = manga.id;
          const mangaUrl = `${this.BASE_URL}/comic/${comicId}`;

          let coverImage: string | undefined;
          if (manga.cover && manga.cover.id && manga.cover.f) {
            coverImage = `https://meo3.comick.pictures/${manga.cover.id}.${manga.cover.f}`;
          }

          let latestChapter = 0;
          let lastUpdated = "";
          let lastUpdatedTimestamp: number | undefined;

          try {
            const chapters = await this.getChapterList(mangaUrl);
            if (chapters.length > 0) {
              latestChapter = chapters[chapters.length - 1].number;
              lastUpdated = chapters[chapters.length - 1].lastUpdated || "";

              if (lastUpdated) {
                const date = new Date(lastUpdated);
                if (!isNaN(date.getTime())) {
                  lastUpdatedTimestamp = date.getTime();
                }
              }
            }
          } catch (error) {
            console.error(`[MangaCloud] Error fetching chapters for ${comicId}:`, error);
          }

          results.push({
            id: comicId,
            title: manga.title || "",
            url: mangaUrl,
            coverImage,
            latestChapter,
            lastUpdated,
            lastUpdatedTimestamp,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[MangaCloud] Search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/comic\/(\d+)/);
    if (!urlMatch) {
      throw new Error("Invalid MangaCloud URL format");
    }

    const id = urlMatch[1];

    try {
      const html = await this.fetchWithRetry(url);
      const $ = cheerio.load(html);

      const title = $("h1").first().text().trim() ||
                   $("title").text().split("|")[0].trim() ||
                   id;

      return { title, id };
    } catch (error) {
      console.error("[MangaCloud] Error extracting manga info:", error);
      return { title: id, id };
    }
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const urlMatch = mangaUrl.match(/\/comic\/(\d+)/);
    if (!urlMatch) {
      throw new Error("Invalid MangaCloud URL format");
    }

    const comicId = urlMatch[1];

    try {
      const response = await fetch(`${this.API_URL}/comic/${comicId}`, {
        headers: {
          "Accept": "*/*",
          "Origin": this.BASE_URL,
          "Referer": `${this.BASE_URL}/`,
          "User-Agent": this.config.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const chapters: ScrapedChapter[] = [];

      if (data.data && data.data.chapters && Array.isArray(data.data.chapters)) {
        for (const chapter of data.data.chapters) {
          const chapterNumber = chapter.number;
          const chapterId = chapter.id;
          const chapterUrl = `${this.BASE_URL}/comic/${comicId}/chapter/${chapterId}`;

          let lastUpdated: string | undefined;
          if (chapter.created_date) {
            const date = new Date(chapter.created_date);
            if (!isNaN(date.getTime())) {
              lastUpdated = date.toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "2-digit",
              });
            }
          }

          chapters.push({
            id: chapterId,
            number: chapterNumber,
            title: chapter.name || `Chapter ${chapterNumber}`,
            url: chapterUrl,
            lastUpdated,
          });
        }
      }

      return chapters.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[MangaCloud] Error fetching chapters:", error);
      throw error;
    }
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const match = chapterUrl.match(/\/chapter\/([^/?]+)/) || chapterUrl.match(/[-/]([a-zA-Z0-9]+)$/);
    if (!match) return [];

    const chapterId = match[1];
    const response = await fetch(`${this.API_URL}/chapter/${chapterId}`, {
      headers: {
        "Accept": "*/*",
        "Origin": this.BASE_URL,
        "Referer": `${this.BASE_URL}/`,
        "User-Agent": this.config.userAgent,
      },
    });

    if (!response.ok) return [];
    const data = await response.json();
    const chapter = data.chapter || data;
    const images: { id: string; f: string }[] = chapter.images || chapter.md_images || [];

    return images.map((img, index) => ({
      url: `https://meo3.comick.pictures/${img.id}.${img.f || "jpg"}`,
      page: index + 1,
    }));
  }

  protected override extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/\/chapter\/(\d+)/);
    return match ? parseFloat(match[1]) : 0;
  }
}
