/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult } from "@/types";

export class MangaloomScraper extends BaseScraper {
  getName(): string {
    return "Mangaloom";
  }

  getBaseUrl(): string {
    return "https://mangaloom.com";
  }

  canHandle(url: string): boolean {
    return url.includes("mangaloom.com");
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

    const ajaxUrl = `${mangaUrl.replace(/\/$/, "")}/ajax/chapters/`;

    try {
      const response = await fetch(ajaxUrl, {
        method: "POST",
        headers: {
          "User-Agent": this.config.userAgent,
          "X-Requested-With": "XMLHttpRequest",
          Referer: mangaUrl,
        },
      });

      let html: string;
      if (response.ok) {
        html = await response.text();
      } else {
        console.log("[Mangaloom] AJAX failed, falling back to regular page");
        html = await this.fetchWithRetry(mangaUrl);
      }

      const $ = cheerio.load(html);

      $(".wp-manga-chapter").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");
        const chapterText = $link.text().trim();

        if (href) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://mangaloom.com${href}`;
          const chapterNumber = this.extractChapterNumber(fullUrl);

          if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
            seenChapterNumbers.add(chapterNumber);
            chapters.push({
              id: `${chapterNumber}`,
              number: chapterNumber,
              title: chapterText,
              url: fullUrl,
            });
          }
        }
      });
    } catch (error) {
      console.error("[Mangaloom] Chapter fetch error:", error);
      try {
        const html = await this.fetchWithRetry(mangaUrl);
        const $ = cheerio.load(html);

        $(".wp-manga-chapter").each((_: number, element: any) => {
          const $chapter = $(element);
          const $link = $chapter.find("a").first();
          const href = $link.attr("href");
          const chapterText = $link.text().trim();

          if (href) {
            const fullUrl = href.startsWith("http")
              ? href
              : `https://mangaloom.com${href}`;
            const chapterNumber = this.extractChapterNumber(fullUrl);

            if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
              seenChapterNumbers.add(chapterNumber);
              chapters.push({
                id: `${chapterNumber}`,
                number: chapterNumber,
                title: chapterText,
                url: fullUrl,
              });
            }
          }
        });
      } catch (fallbackError) {
        console.error("[Mangaloom] Fallback chapter fetch error:", fallbackError);
      }
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
      /\/chapter[/-](\d+)(?:[.-](\d+))?/i,
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
    const searchUrl = `https://mangaloom.com/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".row.c-tabs-item__content").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find(".post-title h3 a, .post-title a").first();
      const url = titleLink.attr("href");
      const title = titleLink.text().trim();

      if (!url) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find(".tab-thumb img").first();
      const coverImage = coverImg.attr("data-src") || coverImg.attr("src");

      const latestChapterLink = $item
        .find(".latest-chap .chapter a, .latest-chap a")
        .first();
      const latestChapterText = latestChapterLink.text().trim();
      const chapterMatch = latestChapterText.match(/Chapter\s+([\d.]+)/i);
      const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      const lastUpdatedSpan = $item.find(".post-on .font-meta, .post-on").first();
      const lastUpdated = lastUpdatedSpan.text().trim();

      const ratingDiv = $item.find(".meta-item.rating").first();
      const ratingText = ratingDiv.text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      results.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `https://mangaloom.com${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated,
        rating,
      });
    });

    return results;
  }
}
