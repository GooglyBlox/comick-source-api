/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface GreedSearchItem {
  ID: number;
  post_title: string;
  post_link: string;
  post_image: string;
  post_latest?: string;
}

interface GreedSearchGroup {
  all?: GreedSearchItem[];
}

interface GreedSearchResponse {
  series: GreedSearchGroup[];
}

export class GreedScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://greedscans.com";

  getName(): string {
    return "Greed Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("greedscans.com") || url.includes("greedscans.org");
  }

  getType(): SourceType {
    return "scanlator";
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".entry-title").first().text().trim() ||
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

      $("#chapterlist ul li").each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find("a").first();
        const href = $link.attr("href");

        if (!href || href.includes("#")) {
          return;
        }

        const chapterText = $chapter.find(".chapternum").text().trim();
        const dateText = $chapter.find(".chapterdate").text().trim();
        const dataNum = $chapter.attr("data-num");

        const fullUrl = href.startsWith("http")
          ? href
          : `${this.BASE_URL}${href}`;

        let chapterNumber: number;
        if (dataNum) {
          chapterNumber = parseFloat(dataNum);
        } else {
          chapterNumber = this.extractChapterNumber(fullUrl);
        }

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);
          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText || `Chapter ${chapterNumber}`,
            url: fullUrl,
            lastUpdated: dateText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[GreedScans] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
      /-chapter-(\d+)(?:[.-](\d+))?/i,
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
    // The themesia "?s=" search page renders results client-side, so the SSR
    // HTML has only a "search-no-results" state. Use the theme's live
    // autocomplete endpoint (admin-ajax ts_ac_do_search) which returns JSON.
    const params = new URLSearchParams({
      action: "ts_ac_do_search",
      ts_ac_query: query,
    });
    const apiUrl = `${this.BASE_URL}/wp-admin/admin-ajax.php?${params.toString()}`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: GreedSearchResponse = await response.json();
    const items: GreedSearchItem[] = (data.series || []).flatMap(
      (group) => group.all || []
    );

    return items.slice(0, 5).map((item) => {
      const slugMatch = item.post_link.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : item.ID.toString();

      const latestMatch = item.post_latest?.match(/(\d+(?:\.\d+)?)/);
      const latestChapter = latestMatch ? parseFloat(latestMatch[1]) : 0;

      return {
        id,
        title: item.post_title,
        url: item.post_link,
        coverImage: item.post_image || undefined,
        latestChapter,
        lastUpdated: "",
      };
    });
  }
}
