/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class DemonicscansScraper extends BaseScraper {
  private readonly BASE_URL = "https://demonicscans.org";

  getName(): string {
    return "DemonicScans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("demonicscans.org");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
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

      $("#chapters-list li").each((_: number, element: any) => {
        const $li = $(element);
        const $link = $li.find("a.chplinks");
        const href = $link.attr("href");

        if (!href) return;

        const fullText = $link.text().trim();
        const $dateSpan = $link.find("span");
        const dateText = $dateSpan.text().trim();

        const linkText = fullText.replace(dateText, "").trim();

        const chapterMatch = linkText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
        if (!chapterMatch) return;

        const chapterNumber = parseFloat(chapterMatch[1]);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = href.startsWith("http")
            ? href
            : `${this.BASE_URL}${href}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: linkText || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[DemonicScans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.BASE_URL}/search.php?manga=${encodeURIComponent(query)}`;

      const response = await fetch(searchUrl, {
        headers: {
          accept: "*/*",
          "accept-language": "en-US,en;q=0.9",
          referer: `${this.BASE_URL}/`,
          "User-Agent": this.config.userAgent,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const matchedSeries: Array<{
        id: string;
        title: string;
        url: string;
        coverImage?: string;
      }> = [];

      $("a[href*='/manga/']").each((_, element) => {
        const $link = $(element);
        const href = $link.attr("href");

        if (!href) return;

        const title = $link.find("div").first().text().trim();
        const $img = $link.find("img.search-thumb");
        const coverImage = $img.attr("src");

        if (!title) return;

        const urlMatch = href.match(/\/manga\/([^/]+)/);
        const id = urlMatch ? urlMatch[1] : "";

        if (!id) return;

        const fullUrl = href.startsWith("http")
          ? href
          : `${this.BASE_URL}${href}`;

        matchedSeries.push({
          id,
          title,
          url: fullUrl,
          coverImage: coverImage?.startsWith("http")
            ? coverImage
            : coverImage
              ? `${this.BASE_URL}${coverImage}`
              : undefined,
        });
      });

      const limitedSeries = matchedSeries.slice(0, 5);

      const results: SearchResult[] = [];

      for (const series of limitedSeries) {
        try {
          const chapters = await this.getChapterList(series.url);

          let latestChapterNumber = 0;
          let lastUpdatedText = "";

          if (chapters.length > 0) {
            const latestChapter = chapters[chapters.length - 1];
            latestChapterNumber = latestChapter.number;
            lastUpdatedText = latestChapter.lastUpdated || "";
          }

          let lastUpdatedTimestamp: number | undefined;
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

          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter: latestChapterNumber,
            lastUpdated: lastUpdatedText,
            lastUpdatedTimestamp,
          });
        } catch (error) {
          console.error(
            `[DemonicScans] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter: 0,
            lastUpdated: "",
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[DemonicScans] Search error:", error);
      throw error;
    }
  }
}
