/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class SirenScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://sirenscans.com";

  getName(): string {
    return "Siren Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("sirenscans.com");
  }

  private slugFromUrl(url: string): string {
    try {
      return new URL(url, this.BASE_URL).pathname.split("/").filter(Boolean)[0] || "";
    } catch {
      return "";
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().replace(/\s+/g, " ").trim() ||
      $("title").text().split(/ [-|] /)[0].trim();

    return { title, id: this.slugFromUrl(url) || Date.now().toString() };
  }

  private async fetchChapters(slug: string): Promise<ScrapedChapter[]> {
    const text = await this.fetchWithRetry(
      `${this.BASE_URL}/?_chapters_html=1&series_slug=${encodeURIComponent(slug)}`
    );
    const data = JSON.parse(text);
    if (!data?.success || !data.rows_html) return [];

    const $ = cheerio.load(String(data.rows_html));
    const byNumber = new Map<number, ScrapedChapter>();

    $("a.chapter-row").each((_: number, element: any) => {
      const $row = $(element);
      if ($row.attr("data-ch-locked") !== "0" || $row.attr("data-ch-paid") === "1") {
        return;
      }

      const href = $row.attr("data-ch-url") || $row.attr("href");
      if (!href) return;

      const label = ($row.attr("data-ch-label") || "").trim();
      const match =
        label.match(/(\d+(?:\.\d+)?)/) || href.match(/chapter-(\d+(?:\.\d+)?)/i);
      if (!match) return;

      const number = parseFloat(match[1]);
      if (byNumber.has(number)) return;

      const dateText = $row.find(".ch-date-row").text().replace(/\s+/g, " ").trim();
      const date = dateText.includes("·")
        ? dateText.split("·").pop()?.trim()
        : dateText;

      byNumber.set(number, {
        id: `${number}`,
        number,
        title: label || `Chapter ${number}`,
        url: new URL(href, this.BASE_URL).toString(),
        lastUpdated: date || undefined,
      });
    });

    return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const slug = this.slugFromUrl(mangaUrl);
      if (!slug) throw new Error(`Invalid series URL: ${mangaUrl}`);
      return await this.fetchChapters(slug);
    } catch (error) {
      console.error("[Siren Scans] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const html = await this.fetchWithRetry(
      `${this.BASE_URL}/?q=${encodeURIComponent(query)}`
    );
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    $("a.group:has(h2)").each((_: number, element: any) => {
      if (results.length >= 20) return;

      const $card = $(element);
      const href = $card.attr("href") || "";
      const id = this.slugFromUrl(href);
      const title = $card.find("h2").first().text().replace(/\s+/g, " ").trim();
      if (!id || !title || seenIds.has(id)) return;
      seenIds.add(id);

      const cover = $card.find("img").first().attr("data-src") || undefined;

      results.push({
        id,
        title,
        url: new URL(href, this.BASE_URL).toString(),
        coverImage: cover,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    await Promise.all(
      results.slice(0, 5).map(async (result) => {
        try {
          const chapters = await this.fetchChapters(result.id);
          const latest = chapters[chapters.length - 1];
          if (latest) {
            result.latestChapter = latest.number;
            result.lastUpdated = latest.lastUpdated || "";
          }
        } catch (error) {
          console.error(
            `[Siren Scans] Failed to fetch chapter list for ${result.title}:`,
            error
          );
        }
      })
    );

    return results;
  }
}
