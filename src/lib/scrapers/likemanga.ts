/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

export class LikeMangaScraper extends BaseScraper {
  getName(): string {
    return "LikeManga";
  }

  getBaseUrl(): string {
    return "https://mgread.io";
  }

  canHandle(url: string): boolean {
    return url.includes("likemanga.in") || url.includes("mgread.io");
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

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const ajaxHtml = await response.text();
      const $ = cheerio.load(ajaxHtml);

      $(".wp-manga-chapter").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");
        const chapterText = $link.text().trim();

        if (href) {
          const fullUrl = href.startsWith("http")
            ? href
            : `https://mgread.io${href}`;
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
      console.error("[LikeManga] AJAX chapter fetch error:", error);
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
    // likemanga.in rebranded to mgread.io (UIkit theme); results are <article> cards.
    const searchUrl = `https://mgread.io/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("article.uk-grid-small").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find("a.uk-link-heading").first();
      const url = titleLink.attr("href");
      const title = titleLink.text().trim();

      if (!url || !title) return;
      if (!/\/manga\//.test(url)) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img.wp-post-image").first();
      const coverImage = coverImg.attr("src") || coverImg.attr("data-src");

      results.push({
        id,
        title,
        url: url.startsWith("http") ? url : `https://mgread.io${url}`,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `https://mgread.io${coverImage}`
            : undefined,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    return results.slice(0, 5);
  }
}
