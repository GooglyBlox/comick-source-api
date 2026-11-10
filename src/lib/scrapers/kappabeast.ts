import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface StrapiManga {
  documentId: string;
  title: string;
  slug: string;
  updatedAt?: string;
  media?: Array<{ coverImage?: { url?: string } | null }>;
}

interface StrapiChapter {
  number: number;
  title?: string | null;
  publishedAt?: string | null;
  earlyAccessUntil?: string | null;
}

export class KappaBeastScraper extends BaseScraper {
  private readonly BASE_URL = "https://kappabeast.com";
  private readonly API_URL = "https://api.kappabeast.com/api/content";
  private readonly ASSET_URL = "https://strapi.kappabeast.com";
  private readonly FALLBACK_API_KEY =
    "d3cb8e38cd5dab862cf772d7912a57281b9d99cdae297372e21376d95fc5b956";
  private apiKey: string | null = null;

  getName(): string {
    return "KappaBeast";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("kappabeast.com");
  }

  private async resolveApiKey(force = false): Promise<string> {
    if (this.apiKey && !force) return this.apiKey;

    let key = this.FALLBACK_API_KEY;
    try {
      const html = await this.fetchWithRetry(this.BASE_URL, 1);
      const bundlePath = html.match(/\/?assets\/index-[\w-]+\.js/)?.[0];
      if (bundlePath) {
        const bundleUrl = `${this.BASE_URL}/${bundlePath.replace(/^\//, "")}`;
        const bundle = await this.fetchWithRetry(bundleUrl, 1);
        const match = bundle.match(/apiKey:\s*"([a-f0-9]{32,})"/i);
        if (match) key = match[1];
      }
    } catch (error) {
      console.error("[KappaBeast] API key extraction failed:", error);
    }

    this.apiKey = key;
    return key;
  }

  private async api<T>(path: string, params: URLSearchParams): Promise<T> {
    const url = `${this.API_URL}/${path}?${params.toString()}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const key = await this.resolveApiKey(attempt > 0);
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
          "X-API-Key": key,
        },
      });

      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as T;
    }

    throw new Error("KappaBeast API request failed");
  }

  private slugFromUrl(url: string): string | null {
    const match = url.match(/\/series\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private seriesUrl(slug: string): string {
    return `${this.BASE_URL}/series/${slug}`;
  }

  private isReleased(chapter: StrapiChapter): boolean {
    if (!chapter.earlyAccessUntil) return true;
    return Date.now() >= new Date(chapter.earlyAccessUntil).getTime();
  }

  private async findMangaBySlug(slug: string): Promise<StrapiManga | null> {
    const params = new URLSearchParams();
    params.set("filters[slug][$eq]", slug);
    params.set("fields[0]", "title");
    params.set("fields[1]", "slug");
    params.set("pagination[pageSize]", "1");
    const result = await this.api<{ data: StrapiManga[] }>("mangas", params);
    return result.data[0] || null;
  }

  private chapterParams(documentId: string, page: number, pageSize: number) {
    const params = new URLSearchParams();
    params.set("filters[manga][documentId][$eq]", documentId);
    params.set("sort", "number:desc");
    params.set("fields[0]", "number");
    params.set("fields[1]", "title");
    params.set("fields[2]", "publishedAt");
    params.set("fields[3]", "earlyAccessUntil");
    params.set("pagination[page]", String(page));
    params.set("pagination[pageSize]", String(pageSize));
    return params;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.slugFromUrl(url);
    if (!slug) {
      throw new Error(`Invalid KappaBeast URL: ${url}`);
    }

    const manga = await this.findMangaBySlug(slug);
    return { title: manga?.title || slug, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const slug = this.slugFromUrl(mangaUrl);
      if (!slug) {
        throw new Error(`Invalid KappaBeast URL: ${mangaUrl}`);
      }

      const manga = await this.findMangaBySlug(slug);
      if (!manga) return [];

      const chapters: ScrapedChapter[] = [];
      const seenChapterNumbers = new Set<number>();
      let page = 1;
      let pageCount = 1;

      do {
        const result = await this.api<{
          data: StrapiChapter[];
          meta: { pagination: { pageCount: number } };
        }>("chapters", this.chapterParams(manga.documentId, page, 100));
        pageCount = result.meta.pagination.pageCount;

        for (const chapter of result.data) {
          const number = Number(chapter.number);
          if (isNaN(number) || seenChapterNumbers.has(number)) continue;
          if (!this.isReleased(chapter)) continue;

          seenChapterNumbers.add(number);
          chapters.push({
            id: `${number}`,
            number,
            title: chapter.title || `Chapter ${number}`,
            url: `${this.BASE_URL}/reader/${slug}/${number}`,
            lastUpdated: chapter.publishedAt || undefined,
          });
        }

        page++;
      } while (page <= pageCount);

      return chapters.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[KappaBeast] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams();
      params.set("filters[title][$containsi]", query);
      params.set("fields[0]", "title");
      params.set("fields[1]", "slug");
      params.set("populate[media][on][shared.media][populate][0]", "coverImage");
      params.set("pagination[pageSize]", "5");

      const result = await this.api<{ data: StrapiManga[] }>("mangas", params);

      return await Promise.all(
        result.data.slice(0, 5).map(async (manga) => {
          const cover = manga.media?.find((m) => m.coverImage?.url)?.coverImage
            ?.url;
          const base: SearchResult = {
            id: manga.slug,
            title: manga.title,
            url: this.seriesUrl(manga.slug),
            coverImage: cover
              ? cover.startsWith("http")
                ? cover
                : `${this.ASSET_URL}${cover}`
              : undefined,
            latestChapter: 0,
            lastUpdated: "",
          };

          try {
            const chapterResult = await this.api<{ data: StrapiChapter[] }>(
              "chapters",
              this.chapterParams(manga.documentId, 1, 5),
            );
            const latest = chapterResult.data.find((c) => this.isReleased(c));
            if (latest) {
              const timestamp = latest.publishedAt
                ? new Date(latest.publishedAt).getTime()
                : NaN;
              return {
                ...base,
                latestChapter: Number(latest.number) || 0,
                lastUpdated: latest.publishedAt || "",
                lastUpdatedTimestamp: isNaN(timestamp) ? undefined : timestamp,
              };
            }
          } catch (error) {
            console.error(
              `[KappaBeast] Failed to fetch chapters for ${manga.title}:`,
              error,
            );
          }
          return base;
        }),
      );
    } catch (error) {
      console.error("[KappaBeast] Search error:", error);
      throw error;
    }
  }
}
