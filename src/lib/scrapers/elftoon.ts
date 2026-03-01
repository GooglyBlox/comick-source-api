/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class ElfToonScraper extends BaseScraper {
  private readonly BASE_URL = "https://elftoon.com";

  getName(): string {
    return "Elf Toon";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("elftoon.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".post-title h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $(".eplister ul li, #chapterlist ul li").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");

        const isLocked = $link.attr("data-bs-toggle") === "modal" ||
                        href?.includes("/login/") ||
                        !href ||
                        href.includes("#");

        if (isLocked) {
          return;
        }

        const chapterNumAttr = $chapter.attr("data-num");
        const chapterText = $link.find(".chapternum").text().trim();
        const dateText = $link.find(".chapterdate").text().trim();

        let chapterNumber: number;
        if (chapterNumAttr) {
          chapterNumber = parseFloat(chapterNumAttr);
        } else {
          chapterNumber = this.extractChapterNumber(href);
        }

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
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
      console.error("[ElfToon] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const match = html.match(/ts_reader\.run\((\{.*?\})\)/s);
    if (!match) return [];

    try {
      const data = JSON.parse(match[1]);
      const images: string[] = data.sources?.[0]?.images || [];
      return images.map((url, index) => ({ url, page: index + 1 }));
    } catch {
      return [];
    }
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /-chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? parseInt(match[2], 10) : 0;

        if (decimalPart > 0) {
          return mainNumber + decimalPart / 10;
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
      rating?: number;
    }> = [];

    $(".listupd .bs .bsx").each((_, element) => {
      const $item = $(element);
      const link = $item.find("a").first();
      const url = link.attr("href");
      const title = link.attr("title") || $item.find(".tt").text().trim();

      if (!url) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img.ts-post-image").first();
      const coverImage = coverImg.attr("src") || coverImg.attr("data-src");

      const ratingDiv = $item.find(".numscore").first();
      const ratingText = ratingDiv.text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      matchedSeries.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        rating,
      });
    });

    const limitedSeries = matchedSeries.slice(0, 5);

    const results: SearchResult[] = [];
    for (const series of limitedSeries) {
      try {
        const seriesHtml = await this.fetchWithRetry(series.url);
        const $series = cheerio.load(seriesHtml);

        let latestChapter = 0;
        let lastUpdatedText = "";

        $series(".eplister ul li, #chapterlist ul li").each((_, el) => {
          const $ch = $series(el);
          const $link = $ch.find("a").first();
          const href = $link.attr("href");

          const isLocked = $link.attr("data-bs-toggle") === "modal" ||
                          href?.includes("/login/") ||
                          !href ||
                          href.includes("#");

          if (!isLocked) {
            const chapterNumAttr = $ch.attr("data-num");
            if (chapterNumAttr) {
              const num = parseFloat(chapterNumAttr);
              if (num > latestChapter) {
                latestChapter = num;
                lastUpdatedText = $link.find(".chapterdate").text().trim();
              }
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
          rating: series.rating,
        });
      } catch (error) {
        console.error(
          `[ElfToon] Failed to fetch chapter list for ${series.title}:`,
          error
        );
        results.push({
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter: 0,
          lastUpdated: "",
          rating: series.rating,
        });
      }
    }

    return results;
  }
}
