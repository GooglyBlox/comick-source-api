/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class RinkoComicsScraper extends BaseScraper {
  private readonly BASE_URL = "https://rinkocomics.com";
  private readonly PAGE_SIZE = 10;

  getName(): string {
    return "Rinko Comics";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("rinkocomics.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(/ [-–|] /)[0].trim();

    const urlMatch = url.match(/\/comic\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  private parseChapterItems($: cheerio.CheerioAPI): ScrapedChapter[] {
    const chapters: ScrapedChapter[] = [];

    $("li.chapter").each((_: number, element: any) => {
      const $item = $(element);
      const price = parseInt($item.attr("data-price") || "0", 10);
      if ($item.hasClass("locked-chapter") || price > 0) return;

      const href = $item.attr("data-permalink") || $item.find("a").attr("href");
      if (!href || !href.startsWith("http")) return;

      const label = $item.find(".chapter-number").text().replace(/\s+/g, " ").trim();
      const match =
        label.match(/(\d+(?:\.\d+)?)/) ||
        href.match(/chapter-(\d+(?:\.\d+)?)/i);
      if (!match) return;

      const number = parseFloat(match[1]);
      const date = $item.find(".chapter-date").first().text().trim();

      chapters.push({
        id: `${number}`,
        number,
        title: label || `Chapter ${number}`,
        url: href,
        lastUpdated: date || undefined,
      });
    });

    return chapters;
  }

  private async fetchMoreChapters(
    comicId: string,
    nonce: string,
    offset: number
  ): Promise<ScrapedChapter[]> {
    const response = await fetch(`${this.BASE_URL}/wp-admin/admin-ajax.php`, {
      method: "POST",
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: this.BASE_URL,
        Referer: `${this.BASE_URL}/`,
      },
      body: new URLSearchParams({
        action: "load_more_chapters",
        nonce,
        comic_id: comicId,
        offset: String(offset),
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = JSON.parse(await response.text());
    const html = data?.success && data?.data?.html ? String(data.data.html) : "";
    if (!html.trim()) return [];

    return this.parseChapterItems(cheerio.load(html));
  }

  private async loadAllChapters(html: string): Promise<ScrapedChapter[]> {
    const $ = cheerio.load(html);
    const all = this.parseChapterItems($);

    const button = $("#loadMoreChaptersBtn");
    const comicId = button.attr("data-comic-id");
    const nonce = html.match(
      /var comicworld_ajax\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-z0-9]+)"/i
    )?.[1];
    if (!button.length || !comicId || !nonce) return all;

    let offset = parseInt(button.attr("data-offset") || "", 10);
    if (!Number.isFinite(offset)) offset = this.PAGE_SIZE;

    const batchSize = 4;
    for (let round = 0; round < 60; round++) {
      const offsets = Array.from(
        { length: batchSize },
        (_, i) => offset + i * this.PAGE_SIZE
      );
      const pages = await Promise.all(
        offsets.map((value) => this.fetchMoreChapters(comicId, nonce, value))
      );

      let exhausted = false;
      for (const page of pages) {
        all.push(...page);
        if (page.length === 0) exhausted = true;
      }
      if (exhausted) break;
      offset += batchSize * this.PAGE_SIZE;
    }

    return all;
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const raw = await this.loadAllChapters(html);

      const byNumber = new Map<number, ScrapedChapter>();
      for (const chapter of raw) {
        if (!byNumber.has(chapter.number)) byNumber.set(chapter.number, chapter);
      }

      return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error("[Rinko Comics] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&subtype=comic&per_page=20`;
    const hits: Array<{ title?: string; url?: string }> = JSON.parse(
      await this.fetchWithRetry(searchUrl)
    );

    const matched: Array<{ id: string; title: string; url: string }> = [];
    const seenIds = new Set<string>();

    for (const hit of hits) {
      const href = hit.url || "";
      const slugMatch = href.match(/\/comic\/([^/?#]+)\/?$/);
      const title = cheerio.load(hit.title || "").text().replace(/\s+/g, " ").trim();

      if (!slugMatch || !title || seenIds.has(slugMatch[1])) continue;
      seenIds.add(slugMatch[1]);

      matched.push({ id: slugMatch[1], title, url: href });
    }

    const results: SearchResult[] = matched
      .slice(0, 20)
      .map((series) => ({ ...series, latestChapter: 0, lastUpdated: "" }));

    await Promise.all(
      results.slice(0, 5).map(async (result) => {
        try {
          const html = await this.fetchWithRetry(result.url);
          const $ = cheerio.load(html);
          result.coverImage =
            $('meta[property="og:image"]').attr("content") || undefined;

          const latest = this.parseChapterItems($).sort(
            (a, b) => b.number - a.number
          )[0];
          if (latest) {
            result.latestChapter = latest.number;
            result.lastUpdated = latest.lastUpdated || "";
          }
        } catch (error) {
          console.error(
            `[Rinko Comics] Failed to fetch chapter list for ${result.title}:`,
            error
          );
        }
      })
    );

    return results;
  }
}
