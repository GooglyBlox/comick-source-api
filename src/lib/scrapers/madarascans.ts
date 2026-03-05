/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MadaraScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://madarascans.com";

  getName(): string {
    return "Madarascans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("madarascans.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $(".legend-title").first().text().trim() ||
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

      $(".ch-list-grid .ch-item").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a.ch-main-anchor").first();
        const href = $link.attr("href");

        if ($chapter.hasClass("locked")) {
          return;
        }

        if (!href || href.includes("#")) {
          return;
        }

        const chapterNumAttr = $chapter.attr("data-ch");
        const chapterText = $link.find(".ch-num").text().trim();
        const dateText = $link.find(".ch-date").text().trim();

        let chapterNumber: number;
        if (chapterNumAttr) {
          chapterNumber = parseFloat(chapterNumAttr);
        } else {
          chapterNumber = this.extractChapterNumber(chapterText);
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
      console.error("[MadaraScans] Chapter fetch error:", error);
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

  protected extractChapterNumber(text: string): number {
    const patterns = [
      /chapter\s*(\d+(?:\.\d+)?)/i,
      /ch\.?\s*(\d+(?:\.\d+)?)/i,
      /^(\d+(?:\.\d+)?)$/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1]);
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

    $(".legend-card").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find(".legend-content .legend-title a").first();
      const title = titleLink.text().trim();

      let url = titleLink.attr("href");
      if (!url) {
        url = $item.find("a.legend-poster").first().attr("href");
      }

      if (!url || !title) return;

      const slugMatch = url.match(/\/series\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img.legend-img").first();
      const coverImage = coverImg.attr("src") || coverImg.attr("data-src");

      const ratingDiv = $item.find(".legend-rating").first();
      const ratingText = ratingDiv.text().trim();
      const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

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

        $series(".ch-list-grid .ch-item").each((_, el) => {
          const $ch = $series(el);

          if ($ch.hasClass("locked")) {
            return;
          }

          const $link = $ch.find("a.ch-main-anchor").first();
          const href = $link.attr("href");

          if (href && !href.includes("#")) {
            const chapterNumAttr = $ch.attr("data-ch");
            const chapterText = $link.find(".ch-num").text().trim();
            const dateText = $link.find(".ch-date").text().trim();

            let chapterNum: number;
            if (chapterNumAttr) {
              chapterNum = parseFloat(chapterNumAttr);
            } else {
              chapterNum = this.extractChapterNumber(chapterText);
            }

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
          rating: series.rating,
        });
      } catch (error) {
        console.error(
          `[MadaraScans] Failed to fetch chapter list for ${series.title}:`,
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
