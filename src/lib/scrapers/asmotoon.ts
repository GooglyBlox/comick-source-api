/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class AsmotoonScraper extends BaseScraper {
  private readonly BASE_URL = "https://asmotoon.com";

  getName(): string {
    return "Asmodeus Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("asmotoon.com");
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

      $("#chapters > a").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href) return;

        const hasLockOverlay = $link.find(".bg-black\\/70").length > 0;
        if (hasLockOverlay) {
          return;
        }

        const chapterTitle = $link.attr("alt") || $link.attr("title") || "";
        const dateText = $link.attr("d") || "";

        const chapterNumber = this.extractChapterNumber(href, chapterTitle);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterTitle || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[Asmotoon] Chapter fetch error:", error);
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
      const searchUrl = `${this.BASE_URL}/series?q=${encodeURIComponent(query)}`;
      const html = await this.fetchWithRetry(searchUrl);
      const $ = cheerio.load(html);

      const queryLower = query.toLowerCase();
      const matchedSeries: Array<{
        id: string;
        title: string;
        altTitle: string;
        url: string;
        coverImage?: string;
      }> = [];

      $("#searched_series_page > button").each((_, element) => {
        const $button = $(element);
        const id = $button.attr("id");
        const title = $button.attr("alt") || "";
        const fullTitle = $button.attr("title") || "";
        
        if (!id || !title) return;

        const titleMatch = title.toLowerCase().includes(queryLower);
        const altTitleMatch = fullTitle.toLowerCase().includes(queryLower);

        if (titleMatch || altTitleMatch) {
          const $link = $button.find("a").first();
          const href = $link.attr("href");
          
          if (!href) return;

          const $bgDiv = $link.find(".bg-white\\/10.bg-no-repeat.bg-cover").first();
          const styleAttr = $bgDiv.attr("style") || "";
          const imageMatch = styleAttr.match(/background-image:url\(([^)]+)\)/);
          const coverImage = imageMatch ? imageMatch[1] : undefined;

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          matchedSeries.push({
            id,
            title,
            altTitle: fullTitle,
            url: fullUrl,
            coverImage,
          });
        }
      });

      const topResults = matchedSeries.slice(0, 5);

      const results: SearchResult[] = [];
      for (const series of topResults) {
        try {
          const seriesHtml = await this.fetchWithRetry(series.url);
          const $series = cheerio.load(seriesHtml);

          let latestChapter = 0;
          let lastUpdatedText = "";

          $series("#chapters > a").each((_, el) => {
            const $ch = $series(el);
            const hasLockOverlay = $ch.find(".bg-black\\/70").length > 0;
            
            if (hasLockOverlay) {
              return;
            }

            const chapterTitle = $ch.attr("alt") || $ch.attr("title") || "";
            const dateText = $ch.attr("d") || "";
            const href = $ch.attr("href") || "";

            if (href) {
              const chapterNum = this.extractChapterNumber(href, chapterTitle);
              if (chapterNum > latestChapter) {
                latestChapter = chapterNum;
                lastUpdatedText = dateText;
              }
            }
          });

          let lastUpdatedTimestamp: number | undefined;
          if (lastUpdatedText) {
            try {
              const parsedDate = new Date(lastUpdatedText);
              if (!isNaN(parsedDate.getTime())) {
                lastUpdatedTimestamp = parsedDate.getTime();
              }
            } catch {
              // Ignore date parse errors
            }
          }

          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter,
            lastUpdated: lastUpdatedText,
            lastUpdatedTimestamp,
          });
        } catch (error) {
          console.error(
            `[Asmotoon] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter: 0,
            lastUpdated: "",
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[Asmotoon] Search error:", error);
      throw error;
    }
  }
}
