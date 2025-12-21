import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class KaliScanScraper extends BaseScraper {
  private readonly BASE_URL = "https://kaliscan.com";

  getName(): string {
    return "KaliScan";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("kaliscan.com");
  }

  getType(): SourceType {
    return "aggregator";
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $(".title").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/(\d+)-/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    try {
      const urlMatch = mangaUrl.match(/\/manga\/(\d+)-([^/]+)/);
      if (!urlMatch) {
        return chapters;
      }

      const mangaId = urlMatch[1];
      const mangaSlug = urlMatch[2];

      const apiUrl = `${this.BASE_URL}/service/backend/chaplist/?manga_id=${mangaId}&manga_name=${encodeURIComponent(mangaSlug)}`;

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Referer: mangaUrl,
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        return chapters;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      $(".chapter-list li, ul.chapter-list li").each((_, element) => {
        const $item = $(element);

        const link = $item.find("a").first();
        const chapterUrl = link.attr("href");
        const chapterTitle = $item.find(".chapter-title").text().trim();

        if (!chapterUrl) return;

        const chapterNumber = this.extractChapterNumber(chapterUrl);

        const idMatch =
          $item.attr("id")?.match(/c-(.+)/) || chapterUrl.match(/chapter-(.+)/);
        const chapterId = idMatch ? idMatch[1].trim() : "";

        chapters.push({
          id: chapterId,
          number: chapterNumber,
          title: chapterTitle || `Chapter ${chapterNumber}`,
          url: chapterUrl.startsWith("http")
            ? chapterUrl
            : `${this.BASE_URL}${chapterUrl}`,
        });
      });
    } catch (error) {
      console.error("[KaliScan] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected override extractChapterNumber(chapterUrl: string): number {
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
    const searchUrl = `${this.BASE_URL}/search?q=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".book-item, .list.manga-list .book-item").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find('a[href*="/manga/"]').first();
      const url = titleLink.attr("href");
      const title =
        $item.find(".title h3").text().trim() ||
        $item.find("h3").text().trim() ||
        titleLink.attr("title")?.trim();

      if (!url || !title) return;

      const idMatch = url.match(/\/manga\/(\d+)-/);
      const id = idMatch ? idMatch[1] : "";

      const coverImg = $item.find(".thumb img").first();
      const coverImage = coverImg.attr("data-src") || coverImg.attr("src");

      const latestChapterText = $item.find(".latest-chapter").text().trim();
      const chapterMatch = latestChapterText.match(/(\d+(?:\.\d+)?)/);
      const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      const ratingText = $item.find(".rating .score").text().trim();
      const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

      results.push({
        id,
        title,
        url: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated: "",
        rating,
      });
    });

    const resultsWithChapterInfo = await Promise.all(
      results.slice(0, 5).map(async (result) => {
        try {
          const urlMatch = result.url.match(/\/manga\/(\d+)-([^/]+)/);
          if (!urlMatch) return result;

          const mangaId = urlMatch[1];
          const mangaSlug = urlMatch[2];

          const apiUrl = `${this.BASE_URL}/service/backend/chaplist/?manga_id=${mangaId}&manga_name=${encodeURIComponent(mangaSlug)}`;

          const response = await fetch(apiUrl, {
            headers: {
              "User-Agent": this.config.userAgent,
              Referer: result.url,
              Accept: "*/*",
            },
          });

          if (response.ok) {
            const html = await response.text();
            const $ = cheerio.load(html);

            const firstChapter = $(
              ".chapter-list li, ul.chapter-list li",
            ).first();
            const updateTime = firstChapter
              .find(".chapter-update, time.chapter-update")
              .text()
              .trim();

            if (updateTime) {
              return {
                ...result,
                lastUpdated: updateTime,
              };
            }
          }

          return result;
        } catch (error) {
          console.error(
            `[KaliScan] Error fetching chapter info for ${result.title}:`,
            error,
          );
          return result;
        }
      }),
    );

    return resultsWithChapterInfo;
  }
}
