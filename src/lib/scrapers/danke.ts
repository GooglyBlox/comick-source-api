import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface GuyaListEntry {
  slug: string;
  title?: string;
  cover?: string;
  last_updated?: number;
}

interface GuyaChapter {
  title?: string;
  is_public?: boolean;
  groups: Record<string, unknown>;
  release_date?: Record<string, number>;
}

interface GuyaSeries {
  slug: string;
  title: string;
  cover?: string;
  groups: Record<string, string>;
  chapters: Record<string, GuyaChapter>;
}

export class DankeScraper extends BaseScraper {
  private readonly BASE_URL = "https://danke.moe";
  private readonly OWN_GROUP = "danke";

  getName(): string {
    return "Danke fürs Lesen";
  }

  getId(): string {
    return "danke-furs-lesen";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("danke.moe");
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

  private absoluteUrl(path?: string): string | undefined {
    if (!path) return undefined;
    return path.startsWith("http") ? path : `${this.BASE_URL}${path}`;
  }

  private extractSlug(url: string): string | null {
    const match = url.match(/\/(?:reader\/series|read\/manga|series)\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private seriesUrl(slug: string): string {
    return `${this.BASE_URL}/reader/series/${slug}/`;
  }

  private pickGroup(
    chapter: GuyaChapter,
    groups: Record<string, string>
  ): { id: string; name: string } | null {
    const ids = Object.keys(chapter.groups || {});
    if (ids.length === 0) return null;

    const own = ids.find((id) =>
      (groups[id] || "").toLowerCase().includes(this.OWN_GROUP)
    );
    const id = own ?? ids[0];
    return { id, name: groups[id] || `Group ${id}` };
  }

  private chaptersFromSeries(series: GuyaSeries): ScrapedChapter[] {
    const chapters = new Map<number, ScrapedChapter>();

    for (const [key, chapter] of Object.entries(series.chapters || {})) {
      if (chapter.is_public === false) continue;
      const number = parseFloat(key);
      if (isNaN(number) || number < 0 || chapters.has(number)) continue;

      const group = this.pickGroup(chapter, series.groups || {});
      const release = group ? chapter.release_date?.[group.id] : undefined;

      chapters.set(number, {
        id: key,
        number,
        title: chapter.title || `Chapter ${key}`,
        url: `${this.BASE_URL}/read/manga/${series.slug}/${key.replace(/\./g, "-")}/1/`,
        lastUpdated: release ? new Date(release * 1000).toISOString() : undefined,
        group: group ?? undefined,
      });
    }

    return Array.from(chapters.values()).sort((a, b) => a.number - b.number);
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const id = this.extractSlug(url);
    if (!id) {
      throw new Error(`Invalid Danke fürs Lesen URL: ${url}`);
    }

    const series = await this.fetchJson<GuyaSeries>(
      `/api/series/${encodeURIComponent(id)}/`
    );
    return { title: series.title || id.replace(/-/g, " "), id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.extractSlug(mangaUrl);
    if (!slug) {
      throw new Error(`Invalid Danke fürs Lesen URL: ${mangaUrl}`);
    }

    try {
      const series = await this.fetchJson<GuyaSeries>(
        `/api/series/${encodeURIComponent(slug)}/`
      );
      return this.chaptersFromSeries(series);
    } catch (error) {
      console.error("[Danke fürs Lesen] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const all = await this.fetchJson<Record<string, GuyaListEntry>>(
        "/api/get_all_series/"
      );
      const needle = query.trim().toLowerCase();

      const matches = Object.entries(all)
        .filter(([title]) => title.toLowerCase().includes(needle))
        .sort(([titleA, a], [titleB, b]) => {
          const startA = titleA.toLowerCase().startsWith(needle) ? 0 : 1;
          const startB = titleB.toLowerCase().startsWith(needle) ? 0 : 1;
          if (startA !== startB) return startA - startB;
          return (b.last_updated || 0) - (a.last_updated || 0);
        })
        .slice(0, 20);

      return await Promise.all(
        matches.map(async ([title, entry], index) => {
          let latestChapter = 0;
          if (index < 5) {
            try {
              const series = await this.fetchJson<GuyaSeries>(
                `/api/series/${encodeURIComponent(entry.slug)}/`
              );
              for (const chapter of this.chaptersFromSeries(series)) {
                if (chapter.number > latestChapter) {
                  latestChapter = chapter.number;
                }
              }
            } catch (error) {
              console.error(
                `[Danke fürs Lesen] Failed to fetch chapters for ${title}:`,
                error
              );
            }
          }

          return {
            id: entry.slug,
            title,
            url: this.seriesUrl(entry.slug),
            coverImage: this.absoluteUrl(entry.cover),
            latestChapter,
            lastUpdated: entry.last_updated
              ? new Date(entry.last_updated * 1000).toISOString()
              : "",
            lastUpdatedTimestamp: entry.last_updated
              ? entry.last_updated * 1000
              : undefined,
          };
        })
      );
    } catch (error) {
      console.error("[Danke fürs Lesen] Search error:", error);
      throw error;
    }
  }
}
