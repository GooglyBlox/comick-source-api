/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

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

  private async fetchPage(url: string): Promise<string> {
    for (let i = 0; i <= this.config.retryAttempts; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "curl/8.4.0",
            Accept: "text/html,*/*;q=0.8",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (error) {
        if (i === this.config.retryAttempts) {
          throw error;
        }
        await this.delay(this.config.downloadDelay * (i + 1));
      }
    }

    throw new Error("Max retries exceeded");
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchPage(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $("div.chp-item a").each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");

      if (!href) return;

      const fullUrl = href.startsWith("http")
        ? href
        : `https://www.novelcool.com${href}`;

      if (!/^https?:\/\/(?:www\.)?novelcool\.com\/chapter\//i.test(fullUrl)) {
        return;
      }

      const chapterTitle = $link
        .find("span.chapter-item-headtitle")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      const chapterNumber = this.parseChapterNumber(chapterTitle, fullUrl);

      if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
        seenChapterNumbers.add(chapterNumber);
        chapters.push({
          id: `${chapterNumber}`,
          number: chapterNumber,
          title: chapterTitle || undefined,
          url: fullUrl,
        });
      }
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  private parseChapterNumber(title: string, chapterUrl: string): number {
    const titleMatch =
      title.match(/\bC(?:h(?:apter)?)?\.?\s*(\d+(?:\.\d+)?)/i) ||
      title.match(/^(\d+(?:\.\d+)?)$/);
    if (titleMatch) {
      return parseFloat(titleMatch[1]);
    }

    const urlMatch = chapterUrl.match(
      /\/chapter\/[^/]*?(?:Ch(?:apter)?)[-.](\d+(?:[-.]\d+)?)(?:[-/]|$)/i,
    );
    if (urlMatch) {
      return parseFloat(urlMatch[1].replace("-", "."));
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://www.novelcool.com/search?name=${encodeURIComponent(query)}`;
    const html = await this.fetchPage(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const searchPromises: Promise<SearchResult | null>[] = [];

    $("div.book-item").each((index, element) => {
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
        if (index >= 5) {
          return {
            id,
            title,
            url: fullUrl,
            coverImage,
            rating,
            lastUpdated,
            latestChapter,
          };
        }
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
