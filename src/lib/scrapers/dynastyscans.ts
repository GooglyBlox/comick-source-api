import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface DynastyTag {
  type: string;
  name: string;
  permalink: string;
}

interface DynastyTagging {
  header?: string;
  title?: string;
  permalink?: string;
  released_on?: string | null;
  tags?: DynastyTag[];
}

interface DynastySeries {
  name: string;
  permalink: string;
  cover?: string | null;
  taggings?: DynastyTagging[];
}

export class DynastyScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://dynasty-scans.com";

  getName(): string {
    return "Dynasty Reader";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("dynasty-scans.com");
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

  private async getSeriesJson(slug: string): Promise<DynastySeries> {
    const response = await fetch(`${this.BASE_URL}/series/${slug}.json`, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`Series request failed: ${response.status}`);
    }

    return (await response.json()) as DynastySeries;
  }

  private getSlug(url: string): string {
    const match = url.match(/\/series\/([^/?#.]+)/);
    return match ? match[1] : "";
  }

  private parseNumber(title: string): number | null {
    const match = title.match(/^(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i);
    return match ? parseFloat(match[1]) : null;
  }

  private parseChapters(
    series: DynastySeries,
  ): (ScrapedChapter & { duplicate: boolean; released: number })[] {
    const entries = (series.taggings || []).filter(
      (t) => !t.header && t.permalink && t.title,
    );
    const numbered = entries.some((t) => this.parseNumber(t.title!) !== null);

    return entries.flatMap((entry, index) => {
      const parsed = this.parseNumber(entry.title!);
      if (numbered && parsed === null) {
        return [];
      }

      const number = numbered ? (parsed as number) : index + 1;
      const released = entry.released_on
        ? new Date(entry.released_on).getTime()
        : 0;
      const scanlator = (entry.tags || []).find((t) => t.type === "Scanlator");
      const subtitle = entry.title!.match(/^[^:]*:\s*(.+)$/);

      return [
        {
          id: entry.permalink!,
          number,
          title: numbered ? subtitle?.[1] : entry.title,
          url: `${this.BASE_URL}/chapters/${entry.permalink}`,
          lastUpdated: released
            ? this.formatRelativeTime(new Date(released))
            : undefined,
          group: scanlator
            ? {
                id: scanlator.permalink,
                name: scanlator.name,
                url: `${this.BASE_URL}/scanlators/${scanlator.permalink}`,
              }
            : undefined,
          duplicate: (entry.tags || []).some((t) => t.name === "Duplicate"),
          released,
        },
      ];
    });
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const html = await this.fetchWithRetry(
        `${this.BASE_URL}/search?q=${encodeURIComponent(query)}&classes[]=Series`,
      );
      const $ = cheerio.load(html);

      const found: { slug: string; title: string }[] = [];
      $("dl.chapter-list dd a.name").each((_, el) => {
        const slug = this.getSlug($(el).attr("href") || "");
        const title = $(el).text().trim();
        if (slug && title) found.push({ slug, title });
      });

      return await Promise.all(
        found.slice(0, 20).map(async ({ slug, title }, index) => {
          let cover: string | undefined;
          let latestChapter = 0;
          let updated: Date | null = null;

          if (index < 5) {
            try {
              const series = await this.getSeriesJson(slug);
              cover = series.cover ? `${this.BASE_URL}${series.cover}` : undefined;
              const chapters = this.parseChapters(series);
              latestChapter = Math.max(0, ...chapters.map((c) => c.number));
              const stamp = Math.max(0, ...chapters.map((c) => c.released));
              updated = stamp ? new Date(stamp) : null;
            } catch {
              latestChapter = 0;
            }
          }

          return {
            id: slug,
            title,
            url: `${this.BASE_URL}/series/${slug}`,
            coverImage: cover,
            latestChapter,
            lastUpdated: updated ? this.formatRelativeTime(updated) : "",
            lastUpdatedTimestamp: updated ? updated.getTime() : undefined,
          };
        }),
      );
    } catch (error) {
      console.error("[Dynasty Reader] search error:", error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);

    if (!slug) {
      throw new Error("Could not extract manga slug from URL");
    }

    const series = await this.getSeriesJson(slug);

    return { title: series.name, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const slug = this.getSlug(mangaUrl);

      if (!slug) {
        throw new Error("Could not extract manga slug from URL");
      }

      const series = await this.getSeriesJson(slug);
      const byNumber = new Map<
        number,
        ScrapedChapter & { duplicate: boolean; released: number }
      >();

      for (const chapter of this.parseChapters(series)) {
        const existing = byNumber.get(chapter.number);
        if (existing && !existing.duplicate && chapter.duplicate) {
          continue;
        }
        byNumber.set(chapter.number, chapter);
      }

      return Array.from(byNumber.values())
        .sort((a, b) => a.number - b.number)
        .map((chapter) => ({
          id: chapter.id,
          number: chapter.number,
          title: chapter.title,
          url: chapter.url,
          lastUpdated: chapter.lastUpdated,
          group: chapter.group,
        }));
    } catch (error) {
      console.error("[Dynasty Reader] chapter list error:", error);
      throw error;
    }
  }
}
