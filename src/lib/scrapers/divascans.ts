/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

interface DivaChapter {
  id: number;
  number: number;
  title: string;
  slug: string;
  isLocked: boolean;
  isAccessible: boolean;
}

interface DivaPost {
  id: number;
  slug: string;
  postTitle: string;
  featuredImage: string;
  averageRating: number;
  updatedAt: string;
  chapters: DivaChapter[];
}

interface DivaSearchResponse {
  posts: DivaPost[];
  totalCount: number;
}

export class DivaScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://divatoon.com";
  private readonly API_URL = "https://api.divatoon.com";

  getName(): string {
    return "Diva Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("divatoon.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
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

      const slugMatch = mangaUrl.match(/\/series\/([^/]+)/);
      const slug = slugMatch ? slugMatch[1] : "";

      $("div.mt-4 img[alt^='Chapter']").each((_: number, element: any) => {
        const $img = $(element);
        const altText = $img.attr("alt") || "";

        const chapterMatch = altText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
        if (!chapterMatch) return;

        const chapterNumber = parseFloat(chapterMatch[1]);

        const $container = $img.closest("div.relative");
        const hasLockIcon =
          $container.find("div.bg-black\\/50 svg, div[class*='bg-black/50'] svg")
            .length > 0;

        if (hasLockIcon) {
          return;
        }

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const fullUrl = `${this.BASE_URL}/series/${slug}/chapter-${chapterNumber}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: `Chapter ${chapterNumber}`,
            url: fullUrl,
          });
        }
      });
    } catch (error) {
      console.error("[Diva Scans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.API_URL}/api/query?page=1&perPage=5&searchTerm=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: DivaSearchResponse = await response.json();

    return data.posts.map((post) => {
      let latestChapter = 0;
      for (const chapter of post.chapters) {
        if (!chapter.isLocked && chapter.isAccessible) {
          if (chapter.number > latestChapter) {
            latestChapter = chapter.number;
          }
        }
      }

      let lastUpdatedTimestamp: number | undefined;
      if (post.updatedAt) {
        const parsedDate = new Date(post.updatedAt);
        if (!isNaN(parsedDate.getTime())) {
          lastUpdatedTimestamp = parsedDate.getTime();
        }
      }

      return {
        id: post.slug,
        title: post.postTitle,
        url: `${this.BASE_URL}/series/${post.slug}`,
        coverImage: post.featuredImage,
        latestChapter,
        lastUpdated: post.updatedAt
          ? new Date(post.updatedAt).toLocaleDateString()
          : "",
        lastUpdatedTimestamp,
        rating: post.averageRating,
      };
    });
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    // HeanCMS renders chapter images as img tags
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      const alt = $(el).attr("alt") || "";
      if (src && /chapter|page|(\d+)\.(jpg|jpeg|png|webp)/i.test(src) && !src.includes("logo") && !src.includes("icon") && !src.includes("avatar")) {
        images.push({ url: src, page: images.length + 1 });
      }
    });

    if (images.length > 0) return images;

    // Fallback: try RSC payload pattern (like Asura)
    const imagePattern = /\{"order"\s*:\s*(\d+)\s*,\s*"url"\s*:\s*"([^"]+)"\}/g;
    let match;
    while ((match = imagePattern.exec(html)) !== null) {
      images.push({ url: match[2], page: parseInt(match[1]) + 1 });
    }

    if (images.length > 0) {
      images.sort((a, b) => a.page - b.page);
      return images.map((img, index) => ({ ...img, page: index + 1 }));
    }

    return images;
  }
}
