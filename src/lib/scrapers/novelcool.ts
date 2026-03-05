/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult } from "@/types";

export class NovelCoolScraper extends BaseScraper {
  getName(): string {
    return "NovelCool";
  }

  getBaseUrl(): string {
    return "https://www.novelcool.com";
  }

  canHandle(url: string): boolean {
    return url.includes("novelcool.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $('div.book-name[itemprop="name"]').first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/novel\/([^\/]+)\.html/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $("div.chp-item a").each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");

      if (href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://www.novelcool.com${href}`;
        const chapterNumber = this.extractChapterNumber(fullUrl);

        const chapterTitle = $link
          .find("span.chapter-item-headtitle")
          .text()
          .trim();

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

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/Chapter[/-](\d+(?:\.\d+)?)\//i,
      /\/chapter\/Chapter[/-](\d+(?:\.\d+)?)\//i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
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

    // Get page count from select dropdown
    const pageCount = $("select.sl-page option").length || 1;

    // Get first page image
    const firstImg = $(".mangaread-img img, #manga_picid_1").first().attr("src")?.trim();
    if (firstImg) {
      images.push({ url: firstImg, page: 1 });
    }

    // Fetch remaining pages
    const baseUrl = chapterUrl.replace(/\.html$/, "");
    for (let i = 2; i <= pageCount; i++) {
      try {
        const pageHtml = await this.fetchWithRetry(`${baseUrl}-${i}.html`);
        const $page = cheerio.load(pageHtml);
        const imgUrl = $page(".mangaread-img img, #manga_picid_1").first().attr("src")?.trim();
        if (imgUrl) {
          images.push({ url: imgUrl, page: i });
        }
      } catch {
        break;
      }
    }

    return images;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://www.novelcool.com/search?name=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const searchPromises: Promise<SearchResult | null>[] = [];

    $("div.book-item").each((_, element) => {
      const $item = $(element);

      const link = $item.find('a[href*="/novel/"]').first();
      const url = link.attr("href");

      if (!url) return;

      const fullUrl = url.startsWith("http")
        ? url
        : `https://www.novelcool.com${url}`;

      const title =
        $item
          .find('div.book-name[itemprop="name"]')
          .first()
          .clone()
          .children()
          .remove()
          .end()
          .text()
          .trim() ||
        $item
          .find('div.book-name[itemprop="name"]')
          .first()
          .text()
          .trim()
          .split("\n")[0]
          .trim();

      const idMatch = url.match(/\/novel\/([^\/]+)\.html/);
      const id = idMatch ? idMatch[1] : "";

      const coverImg = $item.find("img").first();
      let coverImage = coverImg.attr("src") || coverImg.attr("cover_url");

      if (coverImage && !coverImage.startsWith("http")) {
        if (coverImage.startsWith("//")) {
          coverImage = `https:${coverImage}`;
        } else if (coverImage.startsWith("/")) {
          coverImage = `https://www.novelcool.com${coverImage}`;
        } else {
          coverImage = `https://www.novelcool.com/${coverImage}`;
        }
      }

      const ratingText = $item
        .find('div.book-rate-num[itemprop="aggregateRating"]')
        .text()
        .trim();
      const rating = ratingText ? parseFloat(ratingText) : 0;

      const lastUpdatedElement = $item.find(
        'span.book-data-time[itemprop="dateModified"]',
      );
      const lastUpdated = lastUpdatedElement.text().trim();

      const promise = (async () => {
        let latestChapter = 0;
        try {
          const chapters = await this.getChapterList(fullUrl);
          if (chapters.length > 0) {
            latestChapter = Math.max(...chapters.map((ch) => ch.number));
          }
        } catch (error) {
          console.error(
            `[NovelCool] Failed to fetch chapters for ${title}:`,
            error,
          );
        }

        return {
          id,
          title,
          url: fullUrl,
          coverImage,
          rating,
          lastUpdated,
          latestChapter,
        };
      })();

      searchPromises.push(promise);
    });

    const resolvedResults = await Promise.all(searchPromises);
    results.push(
      ...resolvedResults.filter((r): r is SearchResult => r !== null),
    );

    return results;
  }
}
