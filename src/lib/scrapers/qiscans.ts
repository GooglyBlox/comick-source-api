/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface QiScansChapter {
  id: number;
  number: number;
  title: string | null;
  slug: string;
  createdAt: string;
  mangaPost: {
    id: number;
  };
}

interface QiScansPost {
  id: number;
  slug: string;
  postTitle: string;
  featuredImage: string;
  updatedAt: string;
  _count: {
    chapters: number;
  };
  averageRating: number;
  chapters?: Array<{
    number: number;
  }>;
}

export class QiScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://qiscans.org";
  private readonly API_URL = "https://api.qiscans.org";

  getName(): string {
    return "Qi Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("qiscans.org");
  }

  getType(): SourceType {
    return "scanlator";
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffYears > 0) return `${diffYears}y ago`;
    if (diffMonths > 0) return `${diffMonths}mo ago`;
    if (diffWeeks > 0) return `${diffWeeks}w ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return "just now";
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.API_URL}/api/query?page=1&perPage=21&searchTerm=${encodeURIComponent(query)}&orderBy=createdAt`;

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const posts: QiScansPost[] = data.posts || [];

      const limitedPosts = posts.slice(0, 5);

      return limitedPosts.map((post) => {
        const latestChapter =
          post.chapters && post.chapters.length > 0
            ? Math.max(...post.chapters.map((ch) => ch.number))
            : post._count?.chapters || 0;

        const lastUpdatedDate = new Date(post.updatedAt);
        const lastUpdated = this.formatRelativeTime(lastUpdatedDate);

        return {
          id: post.id.toString(),
          title: post.postTitle,
          url: `${this.BASE_URL}/series/${post.slug}`,
          coverImage: post.featuredImage || undefined,
          latestChapter,
          lastUpdated,
          lastUpdatedTimestamp: lastUpdatedDate.getTime(),
          rating: post.averageRating || undefined,
        };
      });
    } catch (error) {
      console.error("QiScans search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slugMatch = url.match(/\/series\/([^/]+)/);
    const slug = slugMatch ? slugMatch[1] : "";

    if (!slug) {
      throw new Error("Could not extract manga slug from URL");
    }

    const searchUrl = `${this.API_URL}/api/query?page=1&perPage=1&searchTerm=${encodeURIComponent(slug)}&orderBy=createdAt`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const posts: QiScansPost[] = data.posts || [];

    const manga = posts.find((post) => post.slug === slug);

    if (manga) {
      return {
        title: manga.postTitle,
        id: manga.id.toString(),
      };
    }

    return {
      title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      id: slug,
    };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const { id: mangaId } = await this.extractMangaInfo(mangaUrl);

      const chaptersUrl = `${this.API_URL}/api/v2/posts/${mangaId}/chapters?page=1&perPage=10000&sortOrder=desc&q=`;

      const response = await fetch(chaptersUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      const chapters: QiScansChapter[] = data.data || [];

      const slugMatch = mangaUrl.match(/\/series\/([^/]+)/);
      const mangaSlug = slugMatch ? slugMatch[1] : "";

      const seenChapterNumbers = new Set<number>();
      const result: ScrapedChapter[] = [];

      for (const chapter of chapters) {
        if (seenChapterNumbers.has(chapter.number)) {
          continue;
        }
        seenChapterNumbers.add(chapter.number);

        const chapterUrl = `${this.BASE_URL}/series/${mangaSlug}/${chapter.slug}`;

        result.push({
          id: chapter.id.toString(),
          number: chapter.number,
          title: chapter.title || undefined,
          url: chapterUrl,
          lastUpdated: this.formatRelativeTime(new Date(chapter.createdAt)),
        });
      }

      return result.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("QiScans chapter list error:", error);
      throw error;
    }
  }
}
