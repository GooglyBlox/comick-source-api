/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult } from "@/types";

export class MgekoScraper extends BaseScraper {
  getName(): string {
    return "Mgeko";
  }

  getBaseUrl(): string {
    return "https://www.mgeko.cc";
  }

  canHandle(url: string): boolean {
    return url.includes("mgeko.cc");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1.novel-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^\/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    let chaptersUrl = mangaUrl;
    if (!mangaUrl.includes("/all-chapters")) {
      chaptersUrl = mangaUrl.replace(/\/$/, "") + "/all-chapters";
    }

    const html = await this.fetchWithRetry(chaptersUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $("ul.chapter-list li a").each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");

      if (href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.mgeko.cc${href}`;
        const chapterTitle = $link.find("strong.chapter-title").text().trim();
        const chapterNumber = this.extractChapterNumber(fullUrl, chapterTitle);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);
          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterTitle || undefined,
            url: fullUrl,
          });
        }
      }
    });

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
      /chapter[/-](\d+)(?:[-.\/](\d+))?/i,
      /-ch[/-](\d+)(?:[-.\/](\d+))?/i,
      /[/-](\d+)-eng-li/i,
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

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    $("#chapter-reader img[id^='image-']").each((_, el) => {
      const url = $(el).attr("src")?.trim();
      if (url) {
        images.push({ url, page: images.length + 1 });
      }
    });

    return images;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://www.mgeko.cc/search/?search=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("ul.novel-list li.novel-item").each((_, element) => {
      const $item = $(element);

      const link = $item.find('a[href*="/manga/"]').first();
      const url = link.attr("href");

      if (!url) return;

      const fullUrl = url.startsWith("http")
        ? url
        : `https://www.mgeko.cc${url}`;

      const title = $item.find("h4.novel-title").text().trim();

      const idMatch = url.match(/\/manga\/([^\/]+)/);
      const id = idMatch ? idMatch[1] : "";

      const coverImg = $item.find("img").first();
      let coverImage = coverImg.attr("src");

      if (!coverImage || coverImage.includes("loading.gif")) {
        coverImage =
          coverImg.attr("data-src") ||
          coverImg.attr("data-lazy-src") ||
          coverImg.attr("data-original");
      }

      const latestChapterText = $item
        .find("div.novel-stats strong")
        .text()
        .trim();

      let latestChapter = 0;
      const chapterMatch = latestChapterText.match(/Chapters?\s+(\d+)/i);
      if (chapterMatch) {
        latestChapter = parseInt(chapterMatch[1], 10);
      }

      const lastUpdatedElement = $item.find("div.novel-stats span");
      const lastUpdated = lastUpdatedElement.last().text().trim();

      let coverImageUrl = coverImage;
      if (coverImage) {
        if (coverImage.startsWith("http")) {
          coverImageUrl = coverImage;
        } else if (coverImage.startsWith("/")) {
          coverImageUrl = `https://imgsrv4.com/avatar/288x412${coverImage}`;
        } else {
          coverImageUrl = `https://imgsrv4.com/avatar/288x412/${coverImage}`;
        }
      }

      results.push({
        id,
        title,
        url: fullUrl,
        coverImage: coverImageUrl,
        latestChapter,
        lastUpdated,
      });
    });

    return results;
  }
}
