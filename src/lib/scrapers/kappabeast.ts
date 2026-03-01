/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class KappaBeastScraper extends BaseScraper {
  private readonly BASE_URL = "https://kappabeast.com";

  getName(): string {
    return "KappaBeast";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("kappabeast.com");
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

      $("#chapterlist ul li").each((_: number, element: any) => {
        const $li = $(element);
        const $link = $li.find(".eph-num a").first();
        const href = $link.attr("href");

        if (!href) {
          return;
        }

        const chapterText = $link.find(".chapternum").text().trim();
        const chapterNumber =
          this.extractChapterNumber(href) ||
          this.extractChapterNumberFromText(chapterText);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const dateText = $link.find(".chapterdate").text().trim();

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
      console.error("[KappaBeast] Chapter fetch error:", error);
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
      /chapter[/-](\d+(?:[.-]\d+)?)/i,
      /-ch-(\d+(?:[.-]\d+)?)/i,
      /-(\d+(?:[.-]\d+)?)\/?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(/-/g, "."));
      }
    }

    return -1;
  }

  private extractChapterNumberFromText(text: string): number {
    const match = text.match(/chapter\s*(\d+(?:[.-]\d+)?)/i);
    if (match) {
      return parseFloat(match[1].replace(/-/g, "."));
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
      latestChapter?: number;
    }> = [];

    $(".listupd .bs").each((_, element) => {
      const $item = $(element);
      const $link = $item.find("a").first();
      const url = $link.attr("href");
      const title =
        $item.find(".tt").text().trim() ||
        $item.find("h2").text().trim() ||
        $link.attr("title")?.trim();

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img").first();
      const coverImage =
        coverImg.attr("src") ||
        coverImg.attr("data-src") ||
        coverImg.attr("data-lazy-src");

      const ratingText = $item.find(".numscore").text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      const latestChapterText = $item.find(".epxs").text().trim();
      const latestChapterMatch = latestChapterText.match(
        /chapter\s*(\d+(?:\.\d+)?)/i,
      );
      const latestChapter = latestChapterMatch
        ? parseFloat(latestChapterMatch[1])
        : 0;

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
        latestChapter,
      });
    });

    const limitedSeries = matchedSeries.slice(0, 5);

    const results: SearchResult[] = [];
    for (const series of limitedSeries) {
      try {
        const seriesHtml = await this.fetchWithRetry(series.url);
        const $series = cheerio.load(seriesHtml);

        let latestChapter = series.latestChapter || 0;
        let lastUpdatedText = "";

        const $firstChapter = $series("#chapterlist ul li").first();
        if ($firstChapter.length) {
          const $link = $firstChapter.find(".eph-num a").first();
          const chapterText = $link.find(".chapternum").text().trim();
          const chapterNumber =
            this.extractChapterNumber($link.attr("href") || "") ||
            this.extractChapterNumberFromText(chapterText);

          if (chapterNumber > latestChapter) {
            latestChapter = chapterNumber;
          }

          lastUpdatedText = $link.find(".chapterdate").text().trim();
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
          latestChapter,
          lastUpdated: lastUpdatedText,
          lastUpdatedTimestamp,
          rating: series.rating,
        });
      } catch (error) {
        console.error(
          `[KappaBeast] Failed to fetch chapter list for ${series.title}:`,
          error,
        );
        results.push({
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter: series.latestChapter || 0,
          lastUpdated: "",
          rating: series.rating,
        });
      }
    }

    return results;
  }
}
