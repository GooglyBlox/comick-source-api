/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class ManhuaPlusScraper extends BaseScraper {
  getName(): string {
    return "Manhuaplus";
  }

  getBaseUrl(): string {
    return "https://manhuaplus.top";
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("manhuaplus.top");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $(".post-title h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $("nav ul li.row .chapter a").each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");
      const chapterText = $link.text().trim();

      if (href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://manhuaplus.top${href}`;
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
    const searchUrl = `https://manhuaplus.top/search?keyword=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".item.item-follow")
      .slice(0, 5)
      .each((_, element) => {
        const $item = $(element);

        const titleLink = $item.find("figcaption h3 a").first();
        const url = titleLink.attr("href");
        const title = titleLink.text().trim();

        if (!url) return;

        const fullUrl = url.startsWith("http")
          ? url
          : `https://manhuaplus.top${url}`;

        const slugMatch = url.match(/\/manga\/([^/]+)/);
        const id = slugMatch ? slugMatch[1] : "";

        const coverImg = $item.find(".image img").first();
        const coverImage = coverImg.attr("src") || coverImg.attr("data-original");

        const latestChapterLink = $item.find("ul.comic-item li.chapter a").first();
        const latestChapterText = latestChapterLink.text().trim();
        const chapterMatch = latestChapterText.match(/Chapter\s+([\d.]+)/i);
        const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

        const lastUpdatedElement = $item.find("ul.comic-item li.chapter i.time").first();
        const lastUpdated = lastUpdatedElement.text().trim();

        const heartsElement = $item.find(".view .fa-heart").next();
        const heartsText = heartsElement.text().trim();
        const followers = heartsText || undefined;

        results.push({
          id,
          title,
          url: fullUrl,
          coverImage: coverImage?.startsWith("http")
            ? coverImage
            : coverImage
              ? `https://manhuaplus.top${coverImage}`
              : undefined,
          latestChapter,
          lastUpdated,
          followers,
        });
      });

    return results;
  }
}
