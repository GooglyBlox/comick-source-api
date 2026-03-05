/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MistScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://mistscans.com";

  getName(): string {
    return "Mist Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("mistscans.com");
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

      $("#chapters a").each((_: number, element: any) => {
        const $chapter = $(element);
        const href = $chapter.attr("href");

        if (!href) return;

        const hasLock = $chapter
          .find('img[src*="material-symbols:lock"]')
          .length > 0;
        if (hasLock) return;

        const titleAttr = $chapter.attr("title") || "";
        const dateText = $chapter.attr("d") || "";

        const chapterNumber = this.extractChapterNumber(titleAttr);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: titleAttr || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[MistScans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(text: string): number {
    const match = text.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
    if (match) {
      return parseFloat(match[1]);
    }

    const numMatch = text.match(/(\d+(?:\.\d+)?)/);
    if (numMatch) {
      return parseFloat(numMatch[1]);
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

    $("#searched_series_page button").each((_, element) => {
      const $item = $(element);
      const id = $item.attr("id");
      const title = $item.attr("alt") || "";

      if (!id || !title) return;

      const link = $item.find('a[href^="/series/"]').first();
      const href = link.attr("href");
      if (!href) return;

      const url = `${this.BASE_URL}${href}`;

      const coverDiv = $item.find('div[style*="background-image"]').first();
      const styleAttr = coverDiv.attr("style") || "";
      const coverMatch = styleAttr.match(/url\(([^)]+)\)/);
      let coverImage: string | undefined;
      if (coverMatch) {
        coverImage = coverMatch[1].replace(/&amp;/g, "&");
      }

      matchedSeries.push({ id, title, url, coverImage });
    });

    const limitedSeries = matchedSeries.slice(0, 5);

    const results: SearchResult[] = [];
    for (const series of limitedSeries) {
      try {
        const seriesHtml = await this.fetchWithRetry(series.url);
        const $series = cheerio.load(seriesHtml);

        let latestChapter = 0;
        let lastUpdatedText = "";

        $series("#chapters a").each((_, el) => {
          const $ch = $series(el);
          const titleAttr = $ch.attr("title") || "";
          const dateText = $ch.attr("d") || "";

          const chapterNum = this.extractChapterNumber(titleAttr);

          if (chapterNum > latestChapter) {
            latestChapter = chapterNum;
            lastUpdatedText = dateText;
          }
        });

        results.push({
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter,
          lastUpdated: lastUpdatedText,
        });
      } catch (error) {
        console.error(
          `[MistScans] Failed to fetch chapter list for ${series.title}:`,
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
