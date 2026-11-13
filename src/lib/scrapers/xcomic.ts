import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface XComicSource {
  id: string;
  chapterCount: number;
  group?: string;
}

const ENGLISH_FLAG = "\u{1F1EC}\u{1F1E7}";
const MAX_SOURCES = 3;

export class XComicScraper extends BaseScraper {
  getName(): string {
    return "XComic";
  }

  getBaseUrl(): string {
    return "https://xcomic.me";
  }

  canHandle(url: string): boolean {
    return url.includes("xcomic.me");
  }

  private pathId(url: string, kind: string): string | null {
    const match = url.match(new RegExp(`/${kind}/([^/?#.]+)`));
    return match ? match[1] : null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title = $("title").text().split("::")[0].trim();
    const id = this.pathId(url, "title") || this.pathId(url, "source");

    return { title, id: id || Date.now().toString() };
  }

  private parseSources(html: string): XComicSource[] {
    const $ = cheerio.load(html);
    const sources: XComicSource[] = [];

    $("section a[href^='/source/']").each((_, el) => {
      const card = $(el).closest("div[class*='border']");
      const flag = card.find(".font-family-NotoColorEmoji").text().trim();
      if (flag !== ENGLISH_FLAG) return;

      const id = this.pathId($(el).attr("href") || "", "source");
      if (!id) return;

      const count = card.text().match(/([\d,]+)\s+chapters/);
      const group = card
        .find("span")
        .filter((_, s) => $(s).text().trim() === `#${id}`)
        .parent()
        .next()
        .text()
        .trim();

      sources.push({
        id,
        chapterCount: count ? parseInt(count[1].replace(/,/g, ""), 10) : 0,
        group: group || undefined,
      });
    });

    return sources
      .sort((a, b) => b.chapterCount - a.chapterCount)
      .slice(0, MAX_SOURCES);
  }

  private parseChapters(
    html: string,
    group?: string,
  ): { chapters: ScrapedChapter[]; total: number; shown: number } {
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];

    $("a[href^='/chapter/']").each((_, el) => {
      const name = $(el).text().trim();
      const match = name.match(/^ch(?:apter|\.)?\s*(\d+(?:\.\d+)?)$/i);
      if (!match) return;

      const href = $(el).attr("href") || "";
      const time = $(el)
        .closest("div[class*='border']")
        .find("time")
        .attr("data-time");

      chapters.push({
        id: href.split("/").pop() || "",
        number: parseFloat(match[1]),
        title: name,
        url: new URL(href, this.getBaseUrl()).toString(),
        lastUpdated: time
          ? new Date(parseInt(time, 10)).toISOString()
          : undefined,
        group: group ? { id: group, name: group } : undefined,
      });
    });

    const info = $("body")
      .text()
      .match(/Showing\s+\d+\s+to\s+(\d+)\s+of\s+([\d,]+)\s+items/);

    return {
      chapters,
      shown: info ? parseInt(info[1], 10) : chapters.length,
      total: info ? parseInt(info[2].replace(/,/g, ""), 10) : chapters.length,
    };
  }

  private async fetchSourceChapters(
    source: XComicSource,
  ): Promise<ScrapedChapter[]> {
    const base = `${this.getBaseUrl()}/source/${source.id}`;
    const first = this.parseChapters(
      await this.fetchWithRetry(base),
      source.group,
    );
    const chapters = [...first.chapters];

    if (first.total > first.shown && first.shown > 0) {
      const pages = Math.min(Math.ceil(first.total / first.shown), 20);
      const rest = await Promise.all(
        Array.from({ length: pages - 1 }, (_, i) =>
          this.fetchWithRetry(`${base}?page=${i + 2}`).then(
            (html) => this.parseChapters(html, source.group).chapters,
          ),
        ),
      );
      for (const page of rest) chapters.push(...page);
    }

    return chapters;
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const sourceId = this.pathId(mangaUrl, "source");
      let sources: XComicSource[];

      if (sourceId) {
        sources = [{ id: sourceId, chapterCount: 0 }];
      } else {
        const titleId = this.pathId(mangaUrl, "title") || mangaUrl;
        const html = await this.fetchWithRetry(
          `${this.getBaseUrl()}/title/${titleId}`,
        );
        sources = this.parseSources(html);
      }

      const results = await Promise.all(
        sources.map((s) => this.fetchSourceChapters(s).catch(() => [])),
      );

      const chapters: ScrapedChapter[] = [];
      const seen = new Set<number>();
      for (const list of results) {
        for (const chapter of list) {
          if (seen.has(chapter.number)) continue;
          seen.add(chapter.number);
          chapters.push(chapter);
        }
      }

      return chapters.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[XComic] Chapter fetch error:", error);
      return [];
    }
  }

  private async fetchLatest(titleId: string): Promise<{
    latestChapter: number;
    lastUpdated: string;
    timestamp?: number;
  }> {
    const html = await this.fetchWithRetry(
      `${this.getBaseUrl()}/title/${titleId}`,
    );
    const $ = cheerio.load(html);
    let latestChapter = 0;
    let timestamp: number | undefined;

    $("section a[href^='/source/']").each((_, el) => {
      const card = $(el).closest("div[class*='border']");
      const flag = card.find(".font-family-NotoColorEmoji").text().trim();
      if (flag !== ENGLISH_FLAG) return;

      const link = card.find("a[href^='/chapter/']").first();
      const match = link
        .text()
        .trim()
        .match(/^ch(?:apter|\.)?\s*(\d+(?:\.\d+)?)$/i);
      if (!match) return;

      const number = parseFloat(match[1]);
      const time = parseInt(card.find("time").attr("data-time") || "", 10);
      if (number > latestChapter) latestChapter = number;
      if (!isNaN(time) && (!timestamp || time > timestamp)) timestamp = time;
    });

    return {
      latestChapter,
      lastUpdated: timestamp ? new Date(timestamp).toISOString() : "",
      timestamp,
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const html = await this.fetchWithRetry(
      `${this.getBaseUrl()}/search?word=${encodeURIComponent(query)}`,
    );
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    $("a.link[href^='/title/']").each((_, el) => {
      if (results.length >= 20) return;
      const id = this.pathId($(el).attr("href") || "", "title");
      const title = $(el).text().trim();
      if (!id || !title || seen.has(id)) return;
      seen.add(id);

      const cover = $(el).closest("div.flex.border-b").find("img").attr("src");

      results.push({
        id,
        title,
        url: `${this.getBaseUrl()}/title/${id}`,
        coverImage: cover
          ? new URL(cover, this.getBaseUrl()).toString()
          : undefined,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    await Promise.all(
      results.slice(0, 5).map(async (result) => {
        try {
          const latest = await this.fetchLatest(result.id);
          result.latestChapter = latest.latestChapter;
          result.lastUpdated = latest.lastUpdated;
          result.lastUpdatedTimestamp = latest.timestamp;
        } catch {
          result.latestChapter = 0;
        }
      }),
    );

    return results;
  }
}
