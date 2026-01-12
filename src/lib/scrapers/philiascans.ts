/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class PhiliascansScraper extends BaseScraper {
  private readonly BASE_URL = "https://philiascans.org";
  private cachedNonce: string | null = null;

  getName(): string {
    return "Philia Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("philiascans.org");
  }

  private async getNonce(): Promise<string> {
    if (this.cachedNonce) {
      return this.cachedNonce;
    }

    const html = await this.fetchWithRetry(`${this.BASE_URL}/all-mangas/`);

    const nonceMatch = html.match(/liveSearchData\s*=\s*\{[^}]*"nonce"\s*:\s*"([^"]+)"/);
    if (nonceMatch) {
      this.cachedNonce = nonceMatch[1];
      return this.cachedNonce;
    }

    const altMatch = html.match(/security['"]\s*:\s*['"]([a-f0-9]+)['"]/);
    if (altMatch) {
      this.cachedNonce = altMatch[1];
      return this.cachedNonce;
    }

    throw new Error("Could not extract search nonce from page");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".post-title h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $(".list-body-hh ul li.item").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");

        if (!href || href === "#" || $chapter.hasClass("premium-block")) {
          return;
        }

        const chapterText =
          $chapter.attr("data-chapter") ||
          $link.find("zebi").text().trim() ||
          $link.text().trim();

        let chapterNumber: number;
        const dataChapter = $chapter.attr("data-chapter");
        if (dataChapter) {
          const match = dataChapter.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
          chapterNumber = match ? parseFloat(match[1]) : this.extractChapterNumber(href);
        } else {
          chapterNumber = this.extractChapterNumber(href);
        }

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
          });
        }
      });
    } catch (error) {
      console.error("[Philia Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /chapter[/-](\d+)(?:[.-](\d+))?/i,
      /\/(\d+)(?:[.-](\d+))?\/$/i,
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
    try {
      const nonce = await this.getNonce();
      const searchUrl = `${this.BASE_URL}/wp-admin/admin-ajax.php`;
      const formData = new URLSearchParams();
      formData.append("action", "live_search");
      formData.append("security", nonce);
      formData.append("search_query", query);

      const response = await fetch(searchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": this.config.userAgent,
          Accept: "*/*",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${this.BASE_URL}/all-mangas/`,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const matchedSeries: Array<{
        id: string;
        title: string;
        url: string;
        coverImage?: string;
        rating?: number;
      }> = [];

      if (data.results && Array.isArray(data.results)) {
        for (const resultHtml of data.results) {
          const $ = cheerio.load(resultHtml);
          const link = $(".search-result-card");
          const url = link.attr("href");
          const title =
            $(".search-result-title").text().trim() ||
            link.attr("title")?.trim() ||
            "";

          if (!url) continue;

          const slugMatch = url.match(/\/series\/([^/]+)/);
          const id = slugMatch ? slugMatch[1] : "";

          const coverImage = $(".search-result-thumbnail img")
            .first()
            .attr("src");

          const ratingText = $(".search-result-rating span").text().trim();
          const rating = ratingText ? parseFloat(ratingText) : undefined;

          matchedSeries.push({
            id,
            title,
            url,
            coverImage: coverImage?.startsWith("http")
              ? coverImage
              : coverImage
                ? `${this.BASE_URL}${coverImage}`
                : undefined,
            rating,
          });
        }
      }

      const limitedSeries = matchedSeries.slice(0, 5);

      const results: SearchResult[] = [];
      for (const series of limitedSeries) {
        try {
          const seriesHtml = await this.fetchWithRetry(series.url);
          const $series = cheerio.load(seriesHtml);

          let latestChapter = 0;

          $series(".list-body-hh ul li.item").each((_, el) => {
            const $ch = $series(el);
            const $link = $ch.find("a").first();
            const href = $link.attr("href");

            if (href && href !== "#" && !$ch.hasClass("premium-block")) {
              const dataChapter = $ch.attr("data-chapter");
              if (dataChapter) {
                const match = dataChapter.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
                const num = match ? parseFloat(match[1]) : 0;
                if (num > latestChapter) {
                  latestChapter = num;
                }
              }
            }
          });

          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter,
            lastUpdated: "",
            rating: series.rating,
          });
        } catch (error) {
          console.error(
            `[Philia Scans] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          results.push({
            id: series.id,
            title: series.title,
            url: series.url,
            coverImage: series.coverImage,
            latestChapter: 0,
            lastUpdated: "",
            rating: series.rating,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("[Philia Scans] Search error:", error);
      throw error;
    }
  }
}
