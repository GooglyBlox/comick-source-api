import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface PhiliaSeries {
  slug: string;
  title: string;
  coverImageUrl?: string;
  ratingAvg?: string | number;
  latestChapterAt?: string;
}

interface PhiliaChapter {
  number: string | number;
  slug: string;
  publishedAt?: string;
  isEarlyAccess?: boolean;
  earlyAccessUntil?: string | null;
}

export class PhiliascansScraper extends BaseScraper {
  private readonly BASE_URL = "https://philiascans.org";

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

  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${path}`, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchChapters(slug: string): Promise<PhiliaChapter[]> {
    const data = await this.fetchJson<{ items?: PhiliaChapter[] }>(
      `/api/manga/${encodeURIComponent(slug)}/chapters`
    );
    const now = Date.now();

    return (data.items || []).filter((chapter) => {
      if (chapter.isEarlyAccess) return false;
      if (
        chapter.earlyAccessUntil &&
        new Date(chapter.earlyAccessUntil).getTime() > now
      ) {
        return false;
      }
      return true;
    });
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/series\/([^/?#]+)/);
    if (!urlMatch) {
      throw new Error(`Invalid Philia Scans URL: ${url}`);
    }

    const id = urlMatch[1];
    const data = await this.fetchJson<{ items?: PhiliaSeries[] }>(
      `/api/manga?q=${encodeURIComponent(id.replace(/-/g, " "))}&perPage=8&orderby=relevance`
    );
    const match = data.items?.find((item) => item.slug === id);

    if (match?.title) {
      return { title: match.title, id };
    }

    const html = await this.fetchWithRetry(url);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].split(/\s[-|]\s/)[0].trim()
      : id.replace(/-/g, " ");

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slugMatch = mangaUrl.match(/\/series\/([^/?#]+)/);
    if (!slugMatch) {
      throw new Error(`Invalid Philia Scans URL: ${mangaUrl}`);
    }
    const slug = slugMatch[1];

    try {
      const items = await this.fetchChapters(slug);
      const chapters = new Map<number, ScrapedChapter>();

      for (const item of items) {
        const number = parseFloat(String(item.number));
        if (isNaN(number) || number < 0 || chapters.has(number)) continue;

        chapters.set(number, {
          id: `${number}`,
          number,
          title: `Chapter ${number}`,
          url: `${this.BASE_URL}/series/${slug}/${item.slug}`,
          lastUpdated: item.publishedAt,
        });
      }

      return Array.from(chapters.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[Philia Scans] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.fetchJson<{ items?: PhiliaSeries[] }>(
        `/api/manga?q=${encodeURIComponent(query)}&perPage=8&orderby=relevance`
      );

      return await Promise.all(
        (data.items || []).slice(0, 5).map(async (series) => {
          let latestChapter = 0;
          try {
            const chapters = await this.fetchChapters(series.slug);
            for (const chapter of chapters) {
              const number = parseFloat(String(chapter.number));
              if (!isNaN(number) && number > latestChapter) {
                latestChapter = number;
              }
            }
          } catch (error) {
            console.error(
              `[Philia Scans] Failed to fetch chapters for ${series.title}:`,
              error
            );
          }

          const rating = series.ratingAvg
            ? parseFloat(String(series.ratingAvg))
            : undefined;

          return {
            id: series.slug,
            title: series.title,
            url: `${this.BASE_URL}/series/${series.slug}`,
            coverImage: series.coverImageUrl?.startsWith("http")
              ? series.coverImageUrl
              : series.coverImageUrl
                ? `${this.BASE_URL}${series.coverImageUrl}`
                : undefined,
            latestChapter,
            lastUpdated: series.latestChapterAt || "",
            lastUpdatedTimestamp: series.latestChapterAt
              ? new Date(series.latestChapterAt).getTime()
              : undefined,
            rating: rating !== undefined && !isNaN(rating) ? rating : undefined,
          };
        })
      );
    } catch (error) {
      console.error("[Philia Scans] Search error:", error);
      throw error;
    }
  }
}
