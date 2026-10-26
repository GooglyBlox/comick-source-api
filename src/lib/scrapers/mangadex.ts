/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface MangaDexRelationship {
  id: string;
  type: string;
  attributes?: Record<string, any>;
}

interface MangaDexManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
    lastChapter?: string | null;
    updatedAt?: string;
  };
  relationships?: MangaDexRelationship[];
}

interface MangaDexChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    pages: number;
    publishAt: string;
    externalUrl: string | null;
  };
  relationships?: MangaDexRelationship[];
}

interface MangaDexList<T> {
  data: T[];
  total: number;
}

export class MangaDexScraper extends BaseScraper {
  private readonly BASE_URL = "https://mangadex.org";
  private readonly API_URL = "https://api.mangadex.org";
  private readonly COVER_URL = "https://uploads.mangadex.org/covers";
  private readonly USER_AGENT = "comick-source-api/1.0";
  private readonly RATINGS =
    "contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica";

  getName(): string {
    return "MangaDex";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("mangadex.org");
  }

  getType(): SourceType {
    return "aggregator";
  }

  private formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
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

  private async getJson<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(`${this.API_URL}${path}`, {
        headers: {
          "User-Agent": this.USER_AGENT,
          Accept: "application/json",
        },
      });

      if (response.status === 429 && attempt < 2) {
        await this.delay(1000 * (attempt + 1));
        continue;
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return (await response.json()) as T;
    }
    throw new Error("API request failed: 429");
  }

  private getMangaId(url: string): string {
    const match = url.match(/\/(?:title|manga)\/([0-9a-f-]{36})/i);
    return match ? match[1] : "";
  }

  private pickTitle(manga: MangaDexManga): string {
    const { title, altTitles } = manga.attributes;
    if (title?.en) return title.en;
    const alt = (altTitles || []).find((t) => t.en);
    if (alt) return alt.en;
    return Object.values(title || {})[0] || "Untitled";
  }

  private parseLast(manga: MangaDexManga): number {
    const last = parseFloat(manga.attributes.lastChapter || "");
    return isNaN(last) ? 0 : last;
  }

  private async getLatestChapter(manga: MangaDexManga): Promise<number> {
    const last = this.parseLast(manga);
    if (last > 0) return last;

    const data = await this.getJson<{
      volumes?: Record<string, { chapters?: Record<string, unknown> }>;
    }>(`/manga/${manga.id}/aggregate?translatedLanguage[]=en`);

    let max = 0;
    for (const volume of Object.values(data.volumes || {})) {
      for (const key of Object.keys(volume.chapters || {})) {
        const n = parseFloat(key);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return max;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.getJson<MangaDexList<MangaDexManga>>(
        `/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art&availableTranslatedLanguage[]=en&order[relevance]=desc&${this.RATINGS}`,
      );
      const items = data.data || [];

      const latest = await Promise.all(
        items.map((manga, index) =>
          index < 5
            ? this.getLatestChapter(manga).catch(() => 0)
            : Promise.resolve(this.parseLast(manga)),
        ),
      );

      return items.map((manga, index) => {
        const cover = manga.relationships?.find((r) => r.type === "cover_art");
        const fileName = cover?.attributes?.fileName;
        const updated = manga.attributes.updatedAt
          ? new Date(manga.attributes.updatedAt)
          : null;

        return {
          id: manga.id,
          title: this.pickTitle(manga),
          url: `${this.BASE_URL}/title/${manga.id}`,
          coverImage: fileName
            ? `${this.COVER_URL}/${manga.id}/${fileName}.256.jpg`
            : undefined,
          latestChapter: latest[index],
          lastUpdated: updated ? this.formatRelativeTime(updated) : "",
          lastUpdatedTimestamp: updated ? updated.getTime() : undefined,
        };
      });
    } catch (error) {
      console.error("[MangaDex] search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const id = this.getMangaId(url);

    if (!id) {
      throw new Error("Could not extract manga id from URL");
    }

    const data = await this.getJson<{ data: MangaDexManga }>(`/manga/${id}`);

    return { title: this.pickTitle(data.data), id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const id = this.getMangaId(mangaUrl);

      if (!id) {
        throw new Error("Could not extract manga id from URL");
      }

      const limit = 500;
      const chapters: MangaDexChapter[] = [];
      let total = 0;

      do {
        const page = await this.getJson<MangaDexList<MangaDexChapter>>(
          `/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=${limit}&offset=${chapters.length}&includes[]=scanlation_group&${this.RATINGS}`,
        );
        total = page.total || 0;
        if (!page.data || page.data.length === 0) break;
        chapters.push(...page.data);
      } while (chapters.length < total);

      const byNumber = new Map<
        number,
        { chapter: ScrapedChapter; published: number }
      >();

      for (const chapter of chapters) {
        const { externalUrl, pages, publishAt } = chapter.attributes;
        const number = parseFloat(chapter.attributes.chapter || "");

        if (externalUrl || pages === 0 || isNaN(number)) {
          continue;
        }

        const published = new Date(publishAt).getTime() || 0;
        const existing = byNumber.get(number);

        if (existing && existing.published >= published) {
          continue;
        }

        const groupRel = chapter.relationships?.find(
          (r) => r.type === "scanlation_group",
        );
        const groupName = groupRel?.attributes?.name;

        byNumber.set(number, {
          published,
          chapter: {
            id: chapter.id,
            number,
            title: chapter.attributes.title || undefined,
            url: `${this.BASE_URL}/chapter/${chapter.id}`,
            lastUpdated: published
              ? this.formatRelativeTime(new Date(published))
              : undefined,
            group:
              groupRel && groupName
                ? {
                    id: groupRel.id,
                    name: groupName,
                    url: `${this.BASE_URL}/group/${groupRel.id}`,
                  }
                : undefined,
          },
        });
      }

      return Array.from(byNumber.values())
        .map((entry) => entry.chapter)
        .sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[MangaDex] chapter list error:", error);
      throw error;
    }
  }
}
