/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class SilentQuillScraper extends BaseScraper {
  getName(): string {
    return "SilentQuill";
  }

  getBaseUrl(): string {
    return "https://www.silentquill.net";
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("silentquill.net");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/silentquill\.net\/([^/]+)\/?$/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $(".eplister#chapterlist ul li").each((_: number, element: any) => {
        const $item = $(element);
        const $link = $item.find(".eph-num a").first();
        const href = $link.attr("href");

        if (!href) return;

        const chapterText = $link.find(".chapternum").text().trim();
        const dateText = $link.find(".chapterdate").text().trim();

        const chapterNumber = this.extractChapterNumber(href, chapterText);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);
          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText,
            url: href,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[SilentQuill] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const patterns = [
      /chapter[/-](\d+(?:\.\d+)?)/i,
      /ch[/-](\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.getBaseUrl()}/?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const items = $(".listupd .bs .bsx").slice(0, 5);

    for (let i = 0; i < items.length; i++) {
      const element = items[i];
      const $item = $(element);

      const $link = $item.find("a").first();
      const url = $link.attr("href");
      if (!url) continue;

      const title = $item.find(".bigor .tt").text().trim();
      if (!title) continue;

      const urlMatch = url.match(/silentquill\.net\/([^/]+)\/?$/);
      const id = urlMatch ? urlMatch[1] : "";

      const $img = $item.find("img").first();
      const coverImage = $img.attr("src");

      const latestChapterText = $item.find(".bigor .epxs").text().trim();
      const chapterMatch = latestChapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      const ratingText = $item.find(".numscore").text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      let lastUpdated = "";
      try {
        const chapters = await this.getChapterList(url);
        if (chapters.length > 0) {
          const mostRecentChapter = chapters[chapters.length - 1];
          lastUpdated = mostRecentChapter.lastUpdated || "";
        }
      } catch (error) {
        console.error(`[SilentQuill] Error fetching chapters for ${url}:`, error);
      }

      results.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.getBaseUrl()}${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated,
        rating,
      });
    }

    return results;
  }
}
