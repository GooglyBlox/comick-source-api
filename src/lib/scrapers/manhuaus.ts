/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

export class ManhuausScraper extends BaseScraper {
  private readonly BASE_URL = "https://manhuaus.club";

  getName(): string {
    return "Manhuaus";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("manhuaus.com") || url.includes("manhuaus.club");
  }

  private async resolveUrl(url: string): Promise<string> {
    if (!url.includes("manhuaus.com")) return url;

    const slugMatch = url.match(/\/manga\/([^/?#]+)/);
    if (!slugMatch) return url.replace("manhuaus.com", "manhuaus.club");

    const slug = slugMatch[1].toLowerCase();
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .replace(/['’]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    try {
      const results = await this.search(slug.replace(/-/g, " "));
      const match = results.find((result) => normalize(result.title) === slug);
      if (match) return match.url;
    } catch (error) {
      console.error("[Manhuaus] Legacy URL resolve error:", error);
    }

    return url.replace("manhuaus.com", "manhuaus.club");
  }

  async extractMangaInfo(inputUrl: string): Promise<{ title: string; id: string }> {
    const url = await this.resolveUrl(inputUrl);
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

  async getChapterList(inputUrl: string): Promise<ScrapedChapter[]> {
    const mangaUrl = await this.resolveUrl(inputUrl);
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
        console.log("[Manhuaus] AJAX failed, falling back to regular page");
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
            : `${this.BASE_URL}${href}`;
          const chapterNumber = this.extractChapterNumber(fullUrl, chapterText);

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
      console.error("[Manhuaus] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      const concatenatedMatch = chapterText.match(/Chapter\s+(\d+)\s*[\+\-]\s*(\d+)/i);
      if (concatenatedMatch) {
        return -1;
      }

      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const patterns = [
      /\/chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? match[2] : null;

        if (decimalPart) {
          const divisor = Math.pow(10, decimalPart.length);
          return mainNumber + parseInt(decimalPart, 10) / divisor;
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
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

      const lastUpdatedSpan = $item
        .find(".post-on .font-meta, .post-on")
        .first();
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
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated,
        rating,
      });
    });

    return results;
  }
}
