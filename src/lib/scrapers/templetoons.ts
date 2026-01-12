/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface TempleToonComic {
  title: string;
  series_slug: string;
  thumbnail: string;
  badge: string;
  status: string;
  created_at: string;
  alternative_names: string;
  update_chapter: string;
  total_views: number;
  Chapter: Array<{
    chapter_name: string;
    chapter_slug: string;
    created_at: string;
  }>;
  _count: {
    Season: number;
    Chapter: number;
    tag_series: number;
    bookmarks_users: number;
    series_users: number;
  };
}

export class TempleToonsScraper extends BaseScraper {
  private readonly BASE_URL = "https://templetoons.com";
  private readonly API_URL = "https://api.templetoons.com/api/allComics";

  getName(): string {
    return "Temple Scan";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("templetoons.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/comic\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $("a.col-span-full").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href) return;

        const hasLockIcon = $link.find("span svg path[d*='M400 224']").length > 0;
        if (hasLockIcon) {
          return;
        }

        const hasPremiumBadge = $link.text().includes("PREMIUM");
        if (hasPremiumBadge) {
          return;
        }

        const chapterTitle = $link.find("h1.text-sm").first().text().trim();
        const subtitle = $link.find("p").first().text().trim();
        const dateText = $link.find("span.text-xs").first().text().trim();

        const chapterNumber = this.extractChapterNumber(href, chapterTitle);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}/comic/${href}`;

          const fullTitle = subtitle
            ? `${chapterTitle} - ${subtitle}`
            : chapterTitle;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: fullTitle || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[TempleToons] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const patterns = [
      /chapter[/-](\d+(?:\.\d+)?)/i,
      /ch[/-](\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const allComics: TempleToonComic[] = await response.json();
      const queryLower = query.toLowerCase();

      const matchedComics = allComics.filter((comic) => {
        const titleMatch = comic.title.toLowerCase().includes(queryLower);
        const altNameMatch = comic.alternative_names
          ?.toLowerCase()
          .includes(queryLower);
        return titleMatch || altNameMatch;
      });

      const topResults = matchedComics.slice(0, 5);

      const results: SearchResult[] = topResults.map((comic) => {
        const url = `${this.BASE_URL}/comic/${comic.series_slug}`;
        
        let latestChapter = 0;
        let lastUpdated = "";
        
        if (comic.Chapter && comic.Chapter.length > 0) {
          const latestChapterData = comic.Chapter[0];
          const chapterMatch = latestChapterData.chapter_name.match(
            /Chapter\s+(\d+(?:\.\d+)?)/i
          );
          if (chapterMatch) {
            latestChapter = parseFloat(chapterMatch[1]);
          }
          lastUpdated = latestChapterData.created_at;
        }

        return {
          id: comic.series_slug,
          title: comic.title,
          url,
          coverImage: comic.thumbnail,
          latestChapter,
          lastUpdated,
          followers: comic._count.bookmarks_users.toString(),
        };
      });

      return results;
    } catch (error) {
      console.error("[TempleToons] Search error:", error);
      throw error;
    }
  }
}
