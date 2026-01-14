/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface KenscansSeries {
  id: number;
  slug: string;
  postTitle: string;
  featuredImage: string;
  updatedAt: string;
  averageRating?: number;
  chapters?: Array<{
    id: number;
    number: number;
    slug: string;
    createdAt: string;
    isLocked: boolean;
  }>;
}

interface KenscansSearchResponse {
  posts: KenscansSeries[];
  totalCount: number;
}

export class KenscansScraper extends BaseScraper {
  private readonly BASE_URL = "https://kencomics.com";
  private readonly API_URL = "https://api.kencomics.com";

  getName(): string {
    return "Kenscans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("kencomics.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $("a[href*='/chapter-']").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href) return;

        const hasLockIcon = $link.find('svg path[d*="5.25 5.25"]').length > 0;
        if (hasLockIcon) {
          return;
        }

        const chapterMatch = href.match(/\/chapter-(\d+(?:\.\d+)?)/);
        if (!chapterMatch) return;

        const chapterNumber = parseFloat(chapterMatch[1]);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const dateText = $link.find(".text-xs.text-white\\/50").first().text().trim();

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[Kenscans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.API_URL}/api/query?page=1&perPage=24&searchTerm=${encodeURIComponent(query)}&seriesType=&seriesStatus=`;

      const response = await fetch(searchUrl, {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          origin: this.BASE_URL,
          referer: `${this.BASE_URL}/`,
          "User-Agent": this.config.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: KenscansSearchResponse = await response.json();

      if (!data.posts || data.posts.length === 0) {
        return [];
      }

      const limitedSeries = data.posts.slice(0, 5);

      const results: SearchResult[] = [];

      for (const series of limitedSeries) {
        try {
          const seriesUrl = `${this.BASE_URL}/series/${series.slug}`;

          const seriesHtml = await this.fetchWithRetry(seriesUrl);
          const $ = cheerio.load(seriesHtml);

          let latestChapter = 0;
          let lastUpdatedText = "";

          $("a[href*='/chapter-']").each((_: number, element: any) => {
            const $link = $(element);
            const href = $link.attr("href");

            if (!href) return;

            const hasLockIcon = $link.find('svg path[d*="5.25 5.25"]').length > 0;
            if (hasLockIcon) {
              return;
            }

            const chapterMatch = href.match(/\/chapter-(\d+(?:\.\d+)?)/);
            if (!chapterMatch) return;

            const chapterNumber = parseFloat(chapterMatch[1]);

            if (chapterNumber > latestChapter) {
              latestChapter = chapterNumber;
              lastUpdatedText = $link.find(".text-xs.text-white\\/50").first().text().trim();
            }
          });

          let lastUpdatedTimestamp: number | undefined;
          if (lastUpdatedText) {
            try {
              const parsedDate = this.parseRelativeDate(lastUpdatedText);
              if (!isNaN(parsedDate.getTime())) {
                lastUpdatedTimestamp = parsedDate.getTime();
              }
            } catch {
              // Ignore date parse errors
            }
          }

          results.push({
            id: series.slug,
            title: series.postTitle,
            url: seriesUrl,
            coverImage: series.featuredImage,
            latestChapter,
            lastUpdated: lastUpdatedText,
            lastUpdatedTimestamp,
            rating: series.averageRating,
          });
        } catch (error) {
          console.error(
            `[Kenscans] Failed to fetch chapter list for ${series.postTitle}:`,
            error
          );
          results.push({
            id: series.slug,
            title: series.postTitle,
            url: `${this.BASE_URL}/series/${series.slug}`,
            coverImage: series.featuredImage,
            latestChapter: 0,
            lastUpdated: "",
            rating: series.averageRating,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[Kenscans] Search error:", error);
      throw error;
    }
  }

  private parseRelativeDate(dateText: string): Date {
    const now = new Date();
    const lowerText = dateText.toLowerCase();

    const daysMatch = lowerText.match(/(\d+)\s+days?\s+ago/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1], 10);
      now.setDate(now.getDate() - days);
      return now;
    }

    const monthsMatch = lowerText.match(/about\s+(\d+)\s+months?\s+ago/);
    if (monthsMatch) {
      const months = parseInt(monthsMatch[1], 10);
      now.setMonth(now.getMonth() - months);
      return now;
    }

    if (lowerText.includes("about") && lowerText.includes("month")) {
      now.setMonth(now.getMonth() - 1);
      return now;
    }

    const isoDate = new Date(dateText);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    return now;
  }
}
