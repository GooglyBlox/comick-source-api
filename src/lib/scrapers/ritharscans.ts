/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class RitharscansScraper extends BaseScraper {
  private readonly BASE_URL = "https://ritharscans.com";

  getName(): string {
    return "Ritharscans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("ritharscans.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/([a-f0-9-]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $("#chapters a").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href) {
          return;
        }

        const $coinBadge = $link.find(".bg-yellow-200");
        if ($coinBadge.length > 0) {
          return;
        }

        const chapterText = $link.find(".text-sm.truncate").first().text().trim();
        const dateText = $link.find(".text-xs.text-white\\/50").first().text().trim();

        let chapterNumber = this.extractChapterNumber(chapterText);

        if (chapterNumber <= 0) {
          chapterNumber = this.extractChapterNumber(href);
        }

        if (chapterNumber > 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[Ritharscans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(text: string): number {
    const patterns = [
      /Chapter\s+(\d+)(?:\.(\d+))?/i,
      /Ch\.\s*(\d+)(?:\.(\d+))?/i,
      /(\d+)(?:\.(\d+))?/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? parseInt(match[2], 10) : 0;

        if (!isNaN(mainNumber)) {
          if (decimalPart > 0) {
            return mainNumber + decimalPart / 10;
          }
          return mainNumber;
        }
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/search?title=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
    }> = [];

    $("button[id]").each((_, element) => {
      const $item = $(element);
      const id = $item.attr("id");
      const $link = $item.find("a").first();
      const href = $link.attr("href");
      const title = $link.attr("title") || $item.find("h3").text().trim();

      if (!href || !id) return;

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;

      const $img = $item.find("div[style*='background-image']").first();
      const styleAttr = $img.attr("style") || "";
      const urlMatch = styleAttr.match(/url\((.*?)\)/);
      const coverImage = urlMatch ? urlMatch[1] : undefined;

      matchedSeries.push({
        id,
        title,
        url: fullUrl,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
      });
    });

    const limitedSeries = matchedSeries.slice(0, 5);

    const results: SearchResult[] = [];
    for (const series of limitedSeries) {
      try {
        const chapters = await this.getChapterList(series.url);

        let latestChapterNumber = 0;
        let lastUpdatedText = "";

        if (chapters.length > 0) {
          const latestChapter = chapters[chapters.length - 1];
          latestChapterNumber = latestChapter.number;
          lastUpdatedText = latestChapter.lastUpdated || "";
        }

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
          latestChapter: latestChapterNumber,
          lastUpdated: lastUpdatedText,
          lastUpdatedTimestamp,
        });
      } catch (error) {
        console.error(
          `[Ritharscans] Failed to fetch chapter list for ${series.title}:`,
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
  }
}
