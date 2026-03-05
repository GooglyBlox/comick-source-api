/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult } from "@/types";

export class WeebCentralScraper extends BaseScraper {
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
        Referer: "https://weebcentral.com/",
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
    return "WeebCentral";
  }

  getBaseUrl(): string {
    return "https://weebcentral.com";
  }

  canHandle(url: string): boolean {
    return url.includes("weebcentral.com");
  }

  isClientOnly(): boolean {
    return true;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $(".title").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const seriesIdMatch = mangaUrl.match(/\/series\/([^/]+)/);
    if (!seriesIdMatch) {
      throw new Error("Invalid WeebCentral series URL");
    }

    const seriesId = seriesIdMatch[1];
    const fullChapterListUrl = `https://weebcentral.com/series/${seriesId}/full-chapter-list`;

    const html = await this.fetchWithRetry(fullChapterListUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];

    $('a[href*="/chapters/"]').each((_index: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");

      if (href && href.includes("/chapters/")) {
        const fullUrl = href.startsWith("http")
          ? href
          : `https://weebcentral.com${href}`;

        let chapterText = $link.find("span").first().text().trim();
        if (!chapterText) {
          chapterText = $link.text().trim();
        }

        chapterText = chapterText.split("\n")[0].trim();

        const episodeMatch = chapterText.match(/Episode\s+(\d+)/i);
        const chapterMatch = chapterText.match(/Chapter\s+(\d+)/i);

        let chapterNumber = 0;
        if (episodeMatch) {
          chapterNumber = parseFloat(episodeMatch[1]);
        } else if (chapterMatch) {
          chapterNumber = parseFloat(chapterMatch[1]);
        } else {
          const numberMatch = chapterText.match(/(\d+)/);
          if (numberMatch) {
            chapterNumber = parseFloat(numberMatch[1]);
          }
        }

        if (
          chapterNumber > 0 &&
          !chapters.some((ch) => ch.number === chapterNumber)
        ) {
          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText,
            url: fullUrl,
          });
        }
      }
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);

    // Find the HTMX endpoint for images
    const hxGet = $("[hx-get*='/images']").attr("hx-get");
    if (!hxGet) return [];

    const imagesUrl = hxGet.startsWith("http") ? hxGet : `https://weebcentral.com${hxGet}`;
    const imagesHtml = await this.fetchWithRetry(imagesUrl);
    const $images = cheerio.load(imagesHtml);
    const images: ChapterImage[] = [];

    $images("img[src]").each((_, el) => {
      const url = $images(el).attr("src")?.trim();
      if (url && url.startsWith("http")) {
        images.push({ url, page: images.length + 1 });
      }
    });

    return images;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `https://weebcentral.com/search/data?author=&text=${encodeURIComponent(query)}&sort=Best+Match&order=Descending&official=Any&anime=Any&adult=Any&display_mode=Full+Display`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("article.bg-base-300").each((_, element) => {
      const $article = $(element);

      const titleLink = $article.find('a[href*="/series/"]').first();
      const url = titleLink.attr("href");

      if (!url) return;

      const urlMatch = url.match(/\/series\/([^/]+)\/(.+)/);
      if (!urlMatch) return;

      const id = urlMatch[1];
      const urlTitle = urlMatch[2];

      let title = titleLink.find(".line-clamp-1").text().trim();
      if (!title) {
        title = $article.find(".text-ellipsis.truncate").text().trim();
      }
      if (!title) {
        title = urlTitle.replace(/-/g, " ");
      }

      const coverImg = $article.find('img[alt*="cover"]').first();
      let coverImage = coverImg.attr("src");

      if (!coverImage) {
        const srcset = coverImg.attr("srcset");
        if (srcset) {
          coverImage = srcset.split(",")[0]?.trim().split(" ")[0];
        }
      }

      results.push({
        id,
        title,
        url: url.startsWith("http") ? url : `https://weebcentral.com${url}`,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `https://weebcentral.com${coverImage}`
            : undefined,
        latestChapter: 0, // Will be updated below
        lastUpdated: "", // WeebCentral search doesn't provide last updated
      });
    });

    // Fetch chapter counts for each result
    const resultsWithChapters = await Promise.all(
      results.map(async (result) => {
        try {
          const chapters = await this.getChapterList(result.url);
          return {
            ...result,
            latestChapter: chapters.length > 0 ? chapters[chapters.length - 1].number : chapters.length,
          };
        } catch (error) {
          console.error(
            `[WeebCentral] Failed to fetch chapters for ${result.title}:`,
            error,
          );
          return result; // Return original result with latestChapter: 0
        }
      }),
    );

    return resultsWithChapters;
  }
}
