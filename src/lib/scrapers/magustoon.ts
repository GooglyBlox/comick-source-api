/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

interface MagusToonPost {
  id: number;
  slug: string;
  postTitle: string;
  isNovel: boolean;
  featuredImage: string;
  chapters?: Array<{
    number: number;
    createdAt: string;
  }>;
  averageRating?: number;
  lastChapterAddedAt?: string;
}

interface MagusToonSearchResponse {
  posts: MagusToonPost[];
  totalCount: number;
}

export class MagusToonScraper extends BaseScraper {
  private readonly BASE_URL = "https://magustoon.org";
  private readonly API_URL = "https://api.magustoon.org";

  getName(): string {
    return "Magus Manga";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("magustoon.org");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $("h1").first().text().trim() ||
      "Unknown";

    const slugMatch = url.match(/\/series\/([^/?]+)/);
    const id = slugMatch ? slugMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      const slugMatch = mangaUrl.match(/\/series\/([^/?]+)/);
      if (!slugMatch) {
        throw new Error("Could not extract series slug from URL");
      }
      const slug = slugMatch[1];

      $(".mt-4.space-y-2 > div").each((_: number, element: any) => {
        const $chapter = $(element);

        const hasLockIcon =
          $chapter.find('path[clip-rule="evenodd"]').attr("d")?.includes("5.25") ||
          false;
        if (hasLockIcon) {
          return;
        }

        const chapterText = $chapter
          .find("span.font-medium")
          .first()
          .text()
          .trim();
        const chapterMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);

        if (!chapterMatch) {
          return;
        }

        const chapterNumber = parseFloat(chapterMatch[1]);

        if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);

          const timeText = $chapter.find("time").text().trim();
          const chapterSlug = `chapter-${Math.floor(chapterNumber)}`;
          const chapterUrl = `${this.BASE_URL}/series/${slug}/${chapterSlug}`;

          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: chapterText,
            url: chapterUrl,
            lastUpdated: timeText || undefined,
          });
        }
      });
    } catch (error) {
      console.error("[MagusToon] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      const apiUrl = `${this.API_URL}/api/query?page=1&perPage=24&searchTerm=${encodeURIComponent(query)}&seriesType=&seriesStatus=`;

      const response = await fetch(apiUrl, {
        headers: {
          Accept: "*/*",
          Origin: this.BASE_URL,
          Referer: `${this.BASE_URL}/`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MagusToonSearchResponse = await response.json();

      const mangaPosts = data.posts.filter((post) => !post.isNovel).slice(0, 5);

      for (const post of mangaPosts) {
        const url = `${this.BASE_URL}/series/${post.slug}`;

        let latestChapter = 0;
        let lastUpdatedText = "";

        if (post.chapters && post.chapters.length > 0) {
          for (const chapter of post.chapters) {
            if (chapter.number > latestChapter) {
              latestChapter = chapter.number;
              lastUpdatedText = chapter.createdAt;
            }
          }
        }

        if (post.lastChapterAddedAt) {
          lastUpdatedText = post.lastChapterAddedAt;
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
          id: post.id.toString(),
          title: post.postTitle,
          url,
          coverImage: post.featuredImage,
          latestChapter,
          lastUpdated: lastUpdatedText,
          lastUpdatedTimestamp,
          rating: post.averageRating,
        });
      }
    } catch (error) {
      console.error("[MagusToon] Search error:", error);
      throw error;
    }

    return results;
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
