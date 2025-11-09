/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

export class AsuraScanScraper extends BaseScraper {
  private readonly BASE_URL = "https://asuracomic.net";

  constructor() {
    super();
  }

  protected override async fetchWithRetry(url: string): Promise<string> {
    // Try direct fetch first (faster, no proxy overhead)
    try {
      const directResponse = await fetch(url, {
        method: "GET",
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        mode: "cors",
        credentials: "omit",
      });

      if (directResponse.ok) {
        return await directResponse.text();
      }
    } catch {
      // CORS failed or network error, fall back to proxy
    }

    // Fallback to proxy
    const proxyUrl = `/api/proxy/html?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(
        error.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return await response.text();
  }

  getName(): string {
    return "AsuraScan";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("asuracomic.net");
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/series?page=1&name=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('a[href^="series/"]').each((_, element) => {
      const $item = $(element);
      const href = $item.attr("href");

      if (!href) return;

      const slugMatch = href.match(/series\/([^/?]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const titleSpan = $item
        .find("span.block.text-\\[13\\.3px\\].font-bold")
        .first();
      const title = titleSpan.text().trim();

      if (!title) return;

      const coverImg = $item.find("img").first();
      const coverImage = coverImg.attr("src") || coverImg.attr("data-src");

      const chapterSpan = $item
        .find("span.text-\\[13px\\].text-\\[\\#999\\]")
        .first();
      const chapterText = chapterSpan.text().trim();
      const chapterMatch = chapterText.match(/Chapter\s+([\d.]+)/i);
      const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}/${href}`;

      results.push({
        id,
        title,
        url: fullUrl,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        latestChapter,
        lastUpdated: "",
      });
    });

    return results;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    let title = $("h1").first().text().trim();

    if (!title) {
      title = $("h2").first().text().trim();
    }

    if (!title) {
      title = $("h3").first().text().trim();
    }

    if (!title) {
      const pageTitle = $("title").text();
      title = pageTitle.split(" - ")[0].split("|")[0].trim();
    }

    const urlMatch = url.match(/\/series\/([^/?]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    const chapterLinks = $('a[href*="/chapter/"]');

    chapterLinks.each((_: number, element: any) => {
      const $link = $(element);
      let href = $link.attr("href");

      if (!href) {
        return;
      }

      const hasPremiumIndicator =
        $link.find("clipPath#clip0_568_418").length > 0 ||
        $link.find('circle[fill="#913FE2"]').length > 0;

      if (hasPremiumIndicator) {
        return;
      }

      const chapterText = $link.find("h3").first().text().trim();

      href = href.trim();

      let fullUrl: string;
      if (href.startsWith("http")) {
        fullUrl = href;
      } else if (href.startsWith("/")) {
        fullUrl = `${this.BASE_URL}${href}`;
      } else {
        fullUrl = `${this.BASE_URL}/series/${href}`;
      }

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
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected override extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/chapter\/(\d+)(?:[.-](\d+))?/i,
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
}

export const asuraScanScraper = new AsuraScanScraper();
