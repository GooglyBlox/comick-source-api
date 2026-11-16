/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface SpiderChapter {
  url: string;
  number: number;
  date?: string;
}

export class SpiderScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://spiderscans.xyz";

  getName(): string {
    return "Spider Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("spiderscans.xyz");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1.detail-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title").text().split(/ [-|] /)[0].trim();

    const urlMatch = url.match(/\/manga\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  private parseChapters(html: string): SpiderChapter[] {
    const match = html.match(
      /window\.SS_ALL_CHAPTERS\s*=\s*(\[[\s\S]*?\]);\s*(?:\n|<\/script>)/
    );
    if (!match) return [];

    let raw: any[];
    try {
      raw = JSON.parse(match[1]);
    } catch {
      return [];
    }

    const seen = new Set<number>();
    const chapters: SpiderChapter[] = [];

    for (const item of raw) {
      const number = Number(item?.number);
      const url = typeof item?.url === "string" ? item.url : "";
      if (!url || !Number.isFinite(number) || number < 0 || seen.has(number)) {
        continue;
      }
      seen.add(number);
      chapters.push({
        url: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
        number,
        date: typeof item.date === "string" ? item.date : undefined,
      });
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const html = await this.fetchWithRetry(mangaUrl);
      return this.parseChapters(html).map((chapter) => ({
        id: `${chapter.number}`,
        number: chapter.number,
        title: `Chapter ${chapter.number}`,
        url: chapter.url,
        lastUpdated: chapter.date,
      }));
    } catch (error) {
      console.error("[Spider Scans] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&subtype=manga&per_page=10`;
    const hits: Array<{ title?: string; url?: string }> = JSON.parse(
      await this.fetchWithRetry(searchUrl),
    );

    const matched: Array<{ id: string; title: string; url: string }> = [];
    const seenIds = new Set<string>();

    for (const hit of hits) {
      const href = hit.url || "";
      const slugMatch = href.match(/\/manga\/([^/?#]+)\/?$/);
      const title = cheerio.load(hit.title || "").text().replace(/\s+/g, " ").trim();

      if (!slugMatch || !title || seenIds.has(slugMatch[1])) continue;
      seenIds.add(slugMatch[1]);

      matched.push({ id: slugMatch[1], title, url: href });
    }

    return Promise.all(
      matched.slice(0, 5).map(async (series): Promise<SearchResult> => {
        try {
          const seriesHtml = await this.fetchWithRetry(series.url);
          const $series = cheerio.load(seriesHtml);
          const coverImage =
            $series('meta[property="og:image"]').attr("content") || undefined;
          const latest = this.parseChapters(seriesHtml).pop();

          return {
            ...series,
            coverImage,
            latestChapter: latest?.number ?? 0,
            lastUpdated: latest?.date ?? "",
          };
        } catch (error) {
          console.error(
            `[Spider Scans] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          return { ...series, latestChapter: 0, lastUpdated: "" };
        }
      })
    );
  }
}
