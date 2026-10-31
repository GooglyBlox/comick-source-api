import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface SwarmComic {
  id: string;
  title: string;
  url: string;
  cover?: string;
  latest_chapter_number?: number | string | null;
  last_updated?: string;
}

interface SwarmChapter {
  id: string;
  lang: string;
  number: string;
  published_date?: string;
  scan_group?: string;
  title?: string;
  rank?: string;
}

export class SwarmScraper extends BaseScraper {
  getName(): string {
    return "Swarm";
  }

  getBaseUrl(): string {
    return "https://swarm.ws";
  }

  canHandle(url: string): boolean {
    return url.includes("swarm.ws");
  }

  private getSlug(url: string): string | null {
    const match = url.match(/\/comic\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);
    if (!slug) throw new Error("Invalid Swarm URL");

    try {
      const results = await this.fetchSearch(slug.replace(/-/g, " "));
      const match = results.find((r) => r.url === slug);
      if (match) return { title: match.title, id: slug };
    } catch {}

    const html = await this.fetchWithRetry(
      `${this.getBaseUrl()}/comic/${slug}`,
    );
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.split(" | ")[0];
    return { title: title?.trim() || slug, id: slug };
  }

  private async fetchSearch(query: string): Promise<SwarmComic[]> {
    const response = await fetch(
      `${this.getBaseUrl()}/api/comic/search?title=${encodeURIComponent(query)}&limit=20`,
      {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
          Referer: `${this.getBaseUrl()}/`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { data?: SwarmComic[] };
    return data.data || [];
  }

  private readPayload(html: string): string {
    let payload = "";
    const pattern = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      try {
        payload += JSON.parse(match[1]);
      } catch {
        continue;
      }
    }
    return payload;
  }

  private extractArray(payload: string, key: string): unknown[] {
    const start = payload.indexOf(`"${key}":[`);
    if (start === -1) return [];

    const begin = start + key.length + 3;
    let depth = 0;
    let inString = false;
    for (let i = begin; i < payload.length; i++) {
      const c = payload[i];
      if (inString) {
        if (c === "\\") i++;
        else if (c === '"') inString = false;
      } else if (c === '"') {
        inString = true;
      } else if (c === "[") {
        depth++;
      } else if (c === "]") {
        depth--;
        if (depth === 0) {
          return JSON.parse(payload.slice(begin, i + 1));
        }
      }
    }
    return [];
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);
    if (!slug) return [];

    try {
      const html = await this.fetchWithRetry(
        `${this.getBaseUrl()}/comic/${slug}`,
      );
      const raw = this.extractArray(
        this.readPayload(html),
        "chapters",
      ) as SwarmChapter[];
      const byNumber = new Map<number, SwarmChapter>();

      for (const chapter of raw) {
        if (chapter.lang !== "en") continue;
        const number = parseFloat(chapter.number);
        if (isNaN(number)) continue;
        const existing = byNumber.get(number);
        if (!existing || (chapter.rank || "z") < (existing.rank || "z")) {
          byNumber.set(number, chapter);
        }
      }

      return Array.from(byNumber.entries())
        .map(([number, chapter]) => ({
          id: chapter.id,
          number,
          title: chapter.title || `Chapter ${number}`,
          url: `${this.getBaseUrl()}/comic/${slug}/chapter/${chapter.number}`,
          lastUpdated: chapter.published_date,
          group:
            chapter.scan_group && !chapter.scan_group.startsWith("$")
              ? { id: chapter.scan_group, name: chapter.scan_group }
              : undefined,
        }))
        .sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[Swarm] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const comics = (await this.fetchSearch(query)).slice(0, 20);

    return Promise.all(
      comics.map(async (comic, index) => {
        let latestChapter = parseFloat(
          String(comic.latest_chapter_number ?? ""),
        );
        if (isNaN(latestChapter)) latestChapter = 0;

        if (latestChapter === 0 && index < 5) {
          try {
            const chapters = await this.getChapterList(
              `${this.getBaseUrl()}/comic/${comic.url}`,
            );
            latestChapter = chapters[chapters.length - 1]?.number ?? 0;
          } catch {
            latestChapter = 0;
          }
        }

        const timestamp = comic.last_updated
          ? new Date(comic.last_updated).getTime()
          : undefined;

        return {
          id: comic.url,
          title: comic.title,
          url: `${this.getBaseUrl()}/comic/${comic.url}`,
          coverImage: comic.cover,
          latestChapter,
          lastUpdated: comic.last_updated || "",
          lastUpdatedTimestamp: timestamp,
        };
      }),
    );
  }
}
