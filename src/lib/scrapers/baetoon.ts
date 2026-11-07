import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface RscChapter {
  id: string;
  number: string;
  title?: string;
  href: string;
  datetime?: string;
  lang?: string;
}

export class BaeToonScraper extends BaseScraper {
  private readonly BASE_URL = "https://baetoon.com";

  getName(): string {
    return "BaeToon";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("baetoon.com");
  }

  private getSlug(url: string): string | null {
    const match = url.match(/\/title-detail\/([^/?#]+)/);
    return match ? match[1] : null;
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

  private extractRscPayload(html: string): string {
    const parts: string[] = [];
    const marker = "self.__next_f.push(";
    let index = html.indexOf(marker);

    while (index !== -1) {
      const start = index + marker.length;
      const end = html.indexOf(")</script>", start);
      if (end === -1) break;
      try {
        const chunk = JSON.parse(html.slice(start, end));
        if (Array.isArray(chunk) && typeof chunk[1] === "string") {
          parts.push(chunk[1]);
        }
      } catch {}
      index = html.indexOf(marker, end);
    }

    return parts.join("");
  }

  private extractJsonArray(payload: string, key: string): unknown[] {
    const keyIndex = payload.indexOf(`"${key}":[`);
    if (keyIndex === -1) return [];

    const start = keyIndex + key.length + 3;
    let depth = 0;
    let inString = false;

    for (let i = start; i < payload.length; i++) {
      const char = payload[i];
      if (inString) {
        if (char === "\\") i++;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "[") depth++;
      else if (char === "]") {
        depth--;
        if (depth === 0) {
          return JSON.parse(payload.slice(start, i + 1));
        }
      }
    }

    return [];
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);
    if (!slug) throw new Error("Invalid BaeToon URL");

    const html = await this.fetchWithRetry(
      `${this.BASE_URL}/title-detail/${slug}`,
    );
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().replace(/^Read\s+/i, "").split(/\s+(?:Korean|Manhwa|Manga|Manhua)/i)[0].trim();

    return { title, id: slug };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);
    if (!slug) return [];

    try {
      const html = await this.fetchWithRetry(
        `${this.BASE_URL}/title-detail/${slug}`,
      );
      const items = this.extractJsonArray(
        this.extractRscPayload(html),
        "chapters",
      ) as RscChapter[];

      const byNumber = new Map<number, ScrapedChapter>();

      for (const item of items) {
        if (item.lang && item.lang.toUpperCase() !== "EN") continue;
        const number = parseFloat(item.number);
        if (isNaN(number) || !item.href || byNumber.has(number)) continue;

        byNumber.set(number, {
          id: item.id,
          number,
          title: item.title || `Chapter ${number}`,
          url: new URL(item.href, this.BASE_URL).toString(),
          lastUpdated: item.datetime,
        });
      }

      return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[BaeToon] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const html = await this.fetchWithRetry(
      `${this.BASE_URL}/search?q=${encodeURIComponent(query)}`,
    );
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    $("article").each((_, element) => {
      if (results.length >= 20) return false;

      const card = $(element);
      const link = card.find('a[title][href^="/title-detail/"]').first();
      const href = link.attr("href");
      const title = link.attr("title")?.trim() || link.text().trim();
      if (!href || !title) return;

      const slug = this.getSlug(href);
      if (!slug || seen.has(slug)) return;
      seen.add(slug);

      const chapterMatch = card
        .find('a[href^="/chapter-detail/"]')
        .first()
        .text()
        .match(/(\d+(?:\.\d+)?)/);
      const datetime = card.find("time").first().attr("datetime");
      const updated = datetime ? new Date(datetime) : null;

      results.push({
        id: slug,
        title,
        url: new URL(href, this.BASE_URL).toString(),
        coverImage: card.find("img").first().attr("src"),
        latestChapter: chapterMatch ? parseFloat(chapterMatch[1]) : 0,
        lastUpdated: updated ? this.formatRelativeTime(updated) : "",
        lastUpdatedTimestamp: updated ? updated.getTime() : undefined,
      });
    });

    return results;
  }
}
