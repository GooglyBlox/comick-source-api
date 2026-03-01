/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class UtoonScraper extends BaseScraper {
  private readonly BASE_URL = "https://utoon.net";

  getName(): string {
    return "UTOON";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("utoon.net");
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

      $("ul.main.version-chap li.wp-manga-chapter").each(
        (_: number, element: any) => {
          const $chapter = $(element);
          const $link = $chapter.find("a").first();
          const href = $link.attr("href");

          // Skip locked chapters (premium-block class or href="#")
          if (
            !href ||
            href === "#" ||
            $chapter.hasClass("premium-block")
          ) {
            return;
          }

          const chapterText = $link.text().trim();
          const dateText = $chapter.find(".chapter-release-date i").text().trim();

          const chapterNumber = this.extractChapterNumber(href);

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
        }
      );
    } catch (error) {
      console.error("[UTOON] Chapter fetch error:", error);
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
      /chapter[/-](\d+)(?:[.-](\d+))?/i,
      /-chapter[/-](\d+)(?:[.-](\d+))?/i,
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
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];

    $(".c-tabs-item__content").each((index, element) => {
      if (index >= 5) return false;

      const $item = $(element);
      const $titleLink = $item.find(".post-title h3 a").first();
      const title = $titleLink.text().trim();
      const url = $titleLink.attr("href");

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const $coverImg = $item.find(".tab-thumb img").first();
      const coverImage =
        $coverImg.attr("src") || $coverImg.attr("data-src") || undefined;

      const latestChapterText = $item
        .find(".meta-item.latest-chap .chapter a")
        .text()
        .trim();
      const latestChapterMatch = latestChapterText.match(/chapter\s*(\d+)/i);
      const latestChapter = latestChapterMatch
        ? parseInt(latestChapterMatch[1], 10)
        : 0;

      const lastUpdated = $item.find(".meta-item.post-on .font-meta").text().trim();

      const ratingText = $item.find(".score.font-meta").text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      let lastUpdatedTimestamp: number | undefined;
      if (lastUpdated) {
        try {
          const parsedDate = new Date(lastUpdated);
          if (!isNaN(parsedDate.getTime())) {
            lastUpdatedTimestamp = parsedDate.getTime();
          }
        } catch {
          // Ignore date parse errors
        }
      }

      results.push({
        id,
        title,
        url,
        coverImage,
        latestChapter,
        lastUpdated,
        lastUpdatedTimestamp,
        rating,
      });
    });

    return results;
  }
}
