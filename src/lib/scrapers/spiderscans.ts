/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class SpiderScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://spiderscans.xyz";

  getName(): string {
    return "Spider Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("spiderscans.xyz");
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
      const mainHtml = await this.fetchWithRetry(mangaUrl);

      const ajaxUrl = mangaUrl.endsWith("/")
        ? `${mangaUrl}ajax/chapters/?t=1`
        : `${mangaUrl}/ajax/chapters/?t=1`;

      let html: string;
      try {
        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "User-Agent": this.config.userAgent,
            Accept: "*/*",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            Referer: mangaUrl,
          },
        });

        if (response.ok) {
          html = await response.text();
        } else {
          html = mainHtml;
        }
      } catch {
        html = mainHtml;
      }

      const $ = cheerio.load(html);

      $("li.wp-manga-chapter").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");

        const hasLock = $link.find(".fa-lock").length > 0;
        const isPremium = $chapter.hasClass("premium-block");
        
        if (!href || href === "#" || hasLock || isPremium) {
          return;
        }

        const chapterText = $link.text().trim();
        const chapterNumber = this.extractChapterNumber(href) || 
                             this.extractChapterNumberFromText(chapterText);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const dateText = $chapter
            .find(".chapter-release-date")
            .text()
            .trim()
            .replace(/[<>]/g, "");

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
      console.error("[Spider Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    $(".reading-content .page-break img, .reading-content img.wp-manga-chapter-img").each((_, el) => {
      const url = $(el).attr("data-src")?.trim() || $(el).attr("src")?.trim();
      if (url && !url.includes("loading") && !url.includes("placeholder")) {
        images.push({ url, page: images.length + 1 });
      }
    });

    return images;
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /chapter[/-](\d+(?:\.\d+)?)/i,
      /-(\d+(?:\.\d+)?)\/?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return -1;
  }

  private extractChapterNumberFromText(text: string): number {
    const match = text.match(/chapter\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      return parseFloat(match[1]);
    }
    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
      rating?: number;
    }> = [];

    $(".c-tabs-item__content").each((_, element) => {
      const $item = $(element);
      const link = $item.find(".post-title a").first();
      const url = link.attr("href");
      const title = link.text().trim();

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img").first();
      const coverImage =
        coverImg.attr("src") ||
        coverImg.attr("data-src") ||
        coverImg.attr("data-lazy-src");

      const ratingText = $item.find(".total_votes").text().trim();
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

        let latestChapter = 0;
        let lastUpdatedText = "";

        const ajaxUrl = series.url.endsWith("/")
          ? `${series.url}ajax/chapters/?t=1`
          : `${series.url}/ajax/chapters/?t=1`;

        let chaptersHtml: string;
        try {
          const response = await fetch(ajaxUrl, {
            method: "POST",
            headers: {
              "User-Agent": this.config.userAgent,
              Accept: "*/*",
              "X-Requested-With": "XMLHttpRequest",
              Referer: series.url,
            },
          });

          chaptersHtml = response.ok ? await response.text() : seriesHtml;
        } catch {
          chaptersHtml = seriesHtml;
        }

        const $chapters = cheerio.load(chaptersHtml);

        $chapters("li.wp-manga-chapter").each((_, el) => {
          if (latestChapter > 0) return false;

          const $ch = $chapters(el);
          const $link = $ch.find("a").first();
          const href = $link.attr("href");

          const hasLock = $link.find(".fa-lock").length > 0;
          const isPremium = $ch.hasClass("premium-block");

          if (href && href !== "#" && !hasLock && !isPremium) {
            const chapterText = $link.text().trim();
            const chapterNum = this.extractChapterNumber(href) || 
                              this.extractChapterNumberFromText(chapterText);
            
            if (chapterNum > latestChapter) {
              latestChapter = chapterNum;
              lastUpdatedText = $ch
                .find(".chapter-release-date")
                .text()
                .trim()
                .replace(/[<>]/g, "");
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
          `[Spider Scans] Failed to fetch chapter list for ${series.title}:`,
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
