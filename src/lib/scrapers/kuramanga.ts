/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class KuramangaScraper extends BaseScraper {
  private readonly BASE_URL = "https://kuramanga.com";

  getName(): string {
    return "KuraManga";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("kuramanga.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".manga-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" – ")[0].trim();

    const urlMatch = url.match(/kuramanga\.com\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $(".chapter-item").each((_, element) => {
        const link = $(element).find("a").first();
        const href = link.attr("href");
        if (!href) return;

        const numberMatch = link.text().match(/(\d+(?:\.\d+)?)/);
        if (!numberMatch) return;

        const chapterNumber = parseFloat(numberMatch[1]);
        if (seenChapterNumbers.has(chapterNumber)) return;
        seenChapterNumbers.add(chapterNumber);

        chapters.push({
          id: `${chapterNumber}`,
          number: chapterNumber,
          title: `Chapter ${chapterNumber}`,
          url: new URL(href, this.BASE_URL).toString(),
          lastUpdated:
            $(element).find("time").first().text().trim() || undefined,
        });
      });
    } catch (error) {
      console.error("[KuraManga] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/search?name=${encodeURIComponent(query)}&offset=0&ajax=1`;

    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json, text/plain, */*",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${this.BASE_URL}/search?name=${encodeURIComponent(query)}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const searchResults = data.data || [];

      const limitedResults = searchResults.slice(0, 5);

      const results: SearchResult[] = [];
      for (const item of limitedResults) {
        const mangaUrl = `${this.BASE_URL}/${item.normalized_title}`;

        try {
          const chapters = await this.getChapterList(mangaUrl);

          let latestChapterNumber = item.latestChapter || 0;
          let lastUpdatedText = "";
          let lastUpdatedTimestamp: number | undefined;

          if (chapters.length > 0) {
            const latestChapter = chapters[chapters.length - 1];
            latestChapterNumber = latestChapter.number;
            lastUpdatedText = latestChapter.lastUpdated || "";

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
          }

          results.push({
            id: item.normalized_title || item.id.toString(),
            title: item.title,
            url: mangaUrl,
            coverImage: item.cover_image_url || item.thumb,
            latestChapter: latestChapterNumber,
            lastUpdated: lastUpdatedText,
            lastUpdatedTimestamp,
            rating: item.rating || undefined,
          });
        } catch (error) {
          console.error(
            `[KuraManga] Failed to fetch chapter list for ${item.title}:`,
            error,
          );
          results.push({
            id: item.normalized_title || item.id.toString(),
            title: item.title,
            url: mangaUrl,
            coverImage: item.cover_image_url || item.thumb,
            latestChapter: item.latestChapter || 0,
            lastUpdated: "",
            rating: item.rating || undefined,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[KuraManga] Search error:", error);
      throw error;
    }
  }
}
