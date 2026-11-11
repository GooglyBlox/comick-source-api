import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface MangaKChapterRef {
  name: string;
}

interface MangaKItem {
  slug: string;
  name: string;
  cover?: string;
  rating?: number;
  updatedAt?: string;
  latestChapters?: MangaKChapterRef[];
}

interface MangaKApiChapter {
  id: string;
  url: string;
  name: string;
  updated_at?: string;
}

export class MangaKScraper extends BaseScraper {
  getName(): string {
    return "MangaK";
  }

  getBaseUrl(): string {
    return "https://mangak.io";
  }

  canHandle(url: string): boolean {
    return url.includes("mangak.io");
  }

  private async fetchPageProps<T>(url: string): Promise<T> {
    const html = await this.fetchWithRetry(url);
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) throw new Error("Missing page data");
    return JSON.parse(match[1]).props.pageProps as T;
  }

  private getSlug(url: string): string | null {
    const match = url.match(/mangak\.io\/([^/?#]+)/);
    if (match) return match[1];
    return /^[^/:?#]+$/.test(url) ? url : null;
  }

  private parseChapterNumber(name: string): number {
    const match = name.match(
      /^(?:vol(?:ume)?\.?\s*\d+\s+)?chapter\s+(\d+(?:\.\d+)?)$/i,
    );
    return match ? parseFloat(match[1]) : -1;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);
    const props = await this.fetchPageProps<{
      initialManga?: { name: string; slug: string };
    }>(`${this.getBaseUrl()}/${slug}`);
    const manga = props.initialManga;
    if (!manga) throw new Error("Manga not found");
    return { title: manga.name, id: manga.slug || slug || "" };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);
    if (!slug) return [];

    try {
      const props = await this.fetchPageProps<{
        initialManga?: { id: string };
      }>(`${this.getBaseUrl()}/${slug}`);
      const mangaId = props.initialManga?.id;
      if (!mangaId) return [];

      const response = await fetch(
        `https://api.mangak.io/titles/${mangaId}/chapters`,
        {
          headers: {
            "User-Agent": this.config.userAgent,
            Accept: "application/json",
            Origin: this.getBaseUrl(),
            Referer: `${this.getBaseUrl()}/`,
          },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as {
        data?: { chapters?: MangaKApiChapter[] };
      };
      const list = data.data?.chapters || [];

      const plain = list.filter((c) => !/^vol/i.test(c.name));
      const volumed = list.filter((c) => /^vol/i.test(c.name));

      const chapters: ScrapedChapter[] = [];
      const seen = new Set<number>();
      for (const item of [...plain, ...volumed]) {
        const number = this.parseChapterNumber(item.name);
        if (number < 0 || seen.has(number)) continue;
        seen.add(number);
        chapters.push({
          id: item.id,
          number,
          title: item.name,
          url: new URL(item.url, this.getBaseUrl()).toString(),
          lastUpdated: item.updated_at,
        });
      }

      return chapters.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[MangaK] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const props = await this.fetchPageProps<{ ssrItems?: MangaKItem[] }>(
      `${this.getBaseUrl()}/search?q=${encodeURIComponent(query)}`,
    );

    return (props.ssrItems || []).slice(0, 20).map((item) => {
      const latest = item.latestChapters?.[0];
      const number = latest ? this.parseChapterNumber(latest.name) : -1;
      const timestamp = item.updatedAt ? Date.parse(item.updatedAt) : NaN;

      return {
        id: item.slug,
        title: item.name,
        url: `${this.getBaseUrl()}/${item.slug}`,
        coverImage: item.cover,
        latestChapter: number > 0 ? number : 0,
        lastUpdated: item.updatedAt || "",
        lastUpdatedTimestamp: isNaN(timestamp) ? undefined : timestamp,
        rating: item.rating,
      };
    });
  }
}
