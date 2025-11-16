/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class AsuraScanScraper extends BaseScraper {
  private readonly BASE_URL = "https://asuracomic.net";

  protected override async fetchWithRetry(url: string): Promise<string> {
    // Direct fetch with proper headers (works in edge runtime)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://asuracomic.net/",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

  isClientOnly(): boolean {
    return true;
  }

  getType(): SourceType {
    return "scanlator";
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

      const chapterNumber = this.extractChapterNumber(fullUrl, chapterText);

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

  protected override extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      // Match concatenated chapters like "Chapter 5 + 6" or "Chapter 5 - 6"
      // But NOT "Chapter 34 - 11.Grand Forge" where the number after dash is a section title
      // The difference: concatenated chapters don't have a period after the second number
      const concatenatedMatch = chapterText.match(/Chapter\s+(\d+)\s*[\+\-]\s*(\d+)(?!\.)(?:\s*$|\s+[^0-9])/i);
      if (concatenatedMatch) {
        return -1;
      }

      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const patterns = [
      /\/chapter\/(\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? match[2] : null;

        if (decimalPart) {
          const divisor = Math.pow(10, decimalPart.length);
          return mainNumber + parseInt(decimalPart, 10) / divisor;
        }
        return mainNumber;
      }
    }

    return -1;
  }
}
