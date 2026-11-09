import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class AsmotoonScraper extends BaseScraper {
  private readonly BASE_URL = "https://asmotoon.com";

  getName(): string {
    return "Asmodeus Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("asmotoon.com");
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/plain, */*",
        Referer: `${this.BASE_URL}/`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private absoluteUrl(href: string): string {
    return href.startsWith("http") ? href : `${this.BASE_URL}${href}`;
  }

  private slugFromUrl(url: string): string {
    const path = url.replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
    return path.replace(/^\/+|\/+$/g, "").replace(/^series\//, "");
  }

  private async fetchChapters(seriesUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(seriesUrl);
    const $ = cheerio.load(html);
    const list = $("#chapters-list").first();
    const uid = list.attr("data-series-uid");
    const slug = list.attr("data-series-slug");

    if (!uid || !slug) return [];

    const data = await this.fetchJson<{ rows_html?: string }>(
      `${this.BASE_URL}/?_chapters_html=1&series_uid=${encodeURIComponent(uid)}&series_slug=${encodeURIComponent(slug)}`,
    );
    if (!data.rows_html) return [];

    const $rows = cheerio.load(data.rows_html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $rows("a.chapter-row").each((_, element) => {
      const $row = $rows(element);
      if ($row.attr("data-ch-locked") === "1") return;

      const href = $row.attr("href") || $row.attr("data-ch-url");
      if (!href) return;

      const label = ($row.attr("data-ch-label") || "").trim();
      const chapterNumber = this.extractChapterNumber(href, label);

      if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
        seenChapterNumbers.add(chapterNumber);
        const dateText = $row.find(".ch-date-row span").first().text().trim();

        chapters.push({
          id: `${chapterNumber}`,
          number: chapterNumber,
          title: label || `Chapter ${chapterNumber}`,
          url: this.absoluteUrl(href),
          lastUpdated: dateText || undefined,
        });
      }
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    return { title, id: this.slugFromUrl(url) || Date.now().toString() };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      return await this.fetchChapters(mangaUrl);
    } catch (error) {
      console.error("[Asmotoon] Chapter fetch error:", error);
      throw error;
    }
  }

  protected extractChapterNumber(chapterUrl: string, chapterText?: string): number {
    if (chapterText) {
      const textMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
      if (textMatch) {
        return parseFloat(textMatch[1]);
      }
    }

    const match = chapterUrl.match(/chapter[/-](\d+(?:[.-]\d+)?)\/?$/i);
    if (match) {
      return parseFloat(match[1].replace(/-/g, "."));
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const data = await this.fetchJson<{
        items?: Array<{ title: string; url: string; cover?: string }>;
      }>(`${this.BASE_URL}/?_ajax=suggest&q=${encodeURIComponent(query)}`);

      const items = (data.items || []).slice(0, 5);

      return await Promise.all(
        items.map(async (item) => {
          const url = this.absoluteUrl(item.url);
          const base: SearchResult = {
            id: this.slugFromUrl(url),
            title: item.title,
            url,
            coverImage: item.cover?.replace("&w=20&q=1", "&w=300&q=75"),
            latestChapter: 0,
            lastUpdated: "",
          };

          try {
            const chapters = await this.fetchChapters(url);
            const latest = chapters[chapters.length - 1];
            if (!latest) return base;

            const timestamp = latest.lastUpdated
              ? new Date(latest.lastUpdated).getTime()
              : NaN;
            return {
              ...base,
              latestChapter: latest.number,
              lastUpdated: latest.lastUpdated || "",
              lastUpdatedTimestamp: isNaN(timestamp) ? undefined : timestamp,
            };
          } catch (error) {
            console.error(
              `[Asmotoon] Failed to fetch chapter list for ${item.title}:`,
              error,
            );
            return base;
          }
        }),
      );
    } catch (error) {
      console.error("[Asmotoon] Search error:", error);
      throw error;
    }
  }
}
