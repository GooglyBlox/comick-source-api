/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class WritersScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://writerscans.com";

  getName(): string {
    return "Writers' Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("writerscans.com");
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
        const $chapter = $(element);
        const href = $chapter.attr("href");

        if (!href || href.includes("#")) {
          return;
        }

        const chapterText = $chapter.attr("alt") || $chapter.attr("title") || "";
        const dateText = $chapter.attr("d") || "";

        const chapterNumber = this.extractChapterNumber(chapterText);

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
      console.error("[Writers' Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
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

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    $("#pages img[uid]").each((_, el) => {
      const uid = $(el).attr("uid")?.trim();
      if (uid) {
        images.push({ url: `https://cdn.meowing.org/uploads/${uid}`, page: images.length + 1 });
      }
    });

    return images;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/series?q=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
    }> = [];

    const queryLower = query.toLowerCase();

    $("#searched_series_page > button").each((_, element) => {
      const $item = $(element);

      const link = $item.find("a").first();
      const url = link.attr("href");
      const title = $item.attr("alt") || $item.attr("title") || "";
      const id = $item.attr("id") || "";

      if (!url || !id || !title) return;

      if (!title.toLowerCase().includes(queryLower)) {
        return;
      }

      const fullUrl = url.startsWith("http") ? url : `${this.BASE_URL}${url}`;

      const bgImageDiv = $item.find('[style*="background-image"]').first();
      const style = bgImageDiv.attr("style") || "";
      const bgImageMatch = style.match(/url\(([^)]+)\)/);
      let coverImage: string | undefined;
      if (bgImageMatch) {
        coverImage = bgImageMatch[1].replace(/['"]/g, "");
        if (coverImage && !coverImage.startsWith("http")) {
          coverImage = `${this.BASE_URL}${coverImage}`;
        }
      }

      matchedSeries.push({
        id,
        title,
        url: fullUrl,
        coverImage,
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

        $series("#chapters > a").each((_, el) => {
          const $ch = $series(el);
          const href = $ch.attr("href");

          if (href && !href.includes("#")) {
            const chapterText = $ch.attr("alt") || $ch.attr("title") || "";
            const dateText = $ch.attr("d") || "";
            const chapterNum = this.extractChapterNumber(chapterText);

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
          `[Writers' Scans] Failed to fetch chapter list for ${series.title}:`,
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
