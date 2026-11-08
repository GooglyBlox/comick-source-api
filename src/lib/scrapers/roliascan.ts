import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface RoliaSearchItem {
  id: number;
  title: string;
  slug: string;
  thumbnail?: string;
  type?: string;
}

interface RoliaChapter {
  id: string;
  chapter: string;
  title?: string | null;
  date?: string;
  language?: string;
  url: string;
}

interface RoliaChapterPage {
  chapters: RoliaChapter[];
  has_more: boolean;
}

export class RoliaScanScraper extends BaseScraper {
  private readonly BASE_URL = "https://roliascan.com";

  getName(): string {
    return "RoliaScan";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("roliascan.com");
  }

  private async getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.BASE_URL}${path}`, {
      ...init,
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        Referer: `${this.BASE_URL}/`,
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private fetchChapterPage(
    mangaId: string,
    offset: number,
    limit: number,
    order: "ASC" | "DESC",
  ): Promise<RoliaChapterPage> {
    return this.getJson<RoliaChapterPage>(
      `/auth/manga-chapters?manga_id=${mangaId}&offset=${offset}&limit=${limit}&order=${order}`,
    );
  }

  private decodeHtml(text: string): string {
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);

    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const titleTag = html.match(/<title>([^<]*)<\/title>/i);

    const title =
      (h1 && this.decodeHtml(h1[1])) ||
      (titleTag && this.decodeHtml(titleTag[1]).split(" - ")[0].trim()) ||
      "";

    const urlMatch = url.match(/\/manga\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seen = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const idMatch = html.match(/data-manga-id="(\d+)"/);
      if (!idMatch) {
        throw new Error("Manga id not found");
      }
      const mangaId = idMatch[1];

      let offset = 0;
      for (let page = 0; page < 20; page++) {
        const data = await this.fetchChapterPage(mangaId, offset, 500, "ASC");
        const batch = data.chapters || [];

        for (const ch of batch) {
          if (ch.language && ch.language !== "en") continue;

          const number = parseFloat(ch.chapter);
          if (isNaN(number) || number < 0 || seen.has(number)) continue;
          seen.add(number);

          chapters.push({
            id: ch.id,
            number,
            title:
              ch.title && ch.title !== "N/A" ? ch.title : `Chapter ${number}`,
            url: ch.url,
            lastUpdated: ch.date || undefined,
          });
        }

        if (!data.has_more || batch.length === 0) break;
        offset += batch.length;
      }
    } catch (error) {
      console.error("[RoliaScan] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];

    const data = await this.getJson<{ results?: RoliaSearchItem[] }>(
      "/auth/search",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 20 }),
      },
    );

    const items = (data.results || [])
      .filter((item) => item.type !== "Novel")
      .slice(0, 20);

    return Promise.all(
      items.map(async (item, index): Promise<SearchResult> => {
        const base: SearchResult = {
          id: item.slug,
          title: item.title,
          url: `${this.BASE_URL}/manga/${item.slug}/`,
          coverImage: item.thumbnail || undefined,
          latestChapter: 0,
          lastUpdated: "",
        };
        if (index >= 5) return base;

        try {
          const page = await this.fetchChapterPage(
            String(item.id),
            0,
            10,
            "DESC",
          );
          const parsed = (page.chapters || [])
            .filter((ch) => !ch.language || ch.language === "en")
            .map((ch) => ({ ch, n: parseFloat(ch.chapter) }))
            .filter((x) => !isNaN(x.n));
          if (parsed.length === 0) return base;

          const latest = parsed.reduce((a, b) => (b.n > a.n ? b : a));
          return {
            ...base,
            latestChapter: latest.n,
            lastUpdated: latest.ch.date || "",
          };
        } catch (error) {
          console.error(
            `[RoliaScan] Failed to fetch chapter list for ${item.title}:`,
            error,
          );
          return base;
        }
      }),
    );
  }
}
