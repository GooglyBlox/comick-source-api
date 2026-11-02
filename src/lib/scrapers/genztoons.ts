/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class GenzToonsScraper extends BaseScraper {
  private readonly BASE_URL = "https://genztoons.org";

  getName(): string {
    return "Genz Toons";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("genztoons.org") || url.includes("genzupdates.com");
  }

  private toAbsolute(href: string): string {
    return href.startsWith("http") ? href : `${this.BASE_URL}${href}`;
  }

  private parseChapters(html: string): ScrapedChapter[] {
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seen = new Set<number>();

    $("#chapters > a").each((_: number, element: any) => {
      const $chapter = $(element);
      const href = $chapter.attr("href");
      if (!href) return;

      const locked =
        $chapter.find("img[alt='Coin']").length > 0 ||
        $chapter.find("img[src*='material-symbols/lock']").length > 0;
      if (locked) return;

      const label = ($chapter.attr("title") || $chapter.text())
        .replace(/\s+/g, " ")
        .trim();
      const match = label.match(/(\d+(?:\.\d+)?)/);
      if (!match) return;

      const chapterNumber = parseFloat(match[1]);
      if (seen.has(chapterNumber)) return;
      seen.add(chapterNumber);

      chapters.push({
        id: `${chapterNumber}`,
        number: chapterNumber,
        title: label || `Chapter ${chapterNumber}`,
        url: this.toAbsolute(href),
        lastUpdated: $chapter.attr("d") || undefined,
      });
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() || $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const html = await this.fetchWithRetry(mangaUrl);
      return this.parseChapters(html);
    } catch (error) {
      console.error("[Genz Toons] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const needle = query.trim().toLowerCase();
    const html = await this.fetchWithRetry(`${this.BASE_URL}/series/`);
    const $ = cheerio.load(html);

    const matched: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
      rank: number;
    }> = [];

    $("#searched_series_page > button").each((_: number, element: any) => {
      const $item = $(element);
      if ($item.attr("data-type") === "novel") return;

      const href = $item.find("a").first().attr("href");
      if (!href) return;

      const title = ($item.attr("alt") || "").trim();
      const haystack = ($item.attr("title") || title).toLowerCase();
      if (needle && !haystack.includes(needle)) return;

      const lowerTitle = title.toLowerCase();
      const rank =
        lowerTitle === needle ? 0 : lowerTitle.startsWith(needle) ? 1 : 2;

      const slugMatch = href.match(/\/series\/([^/?#]+)/);
      const style = $item.find("[style*='background-image']").attr("style");
      const cover = style ? style.match(/url\(([^)]+)\)/) : null;

      matched.push({
        id: slugMatch ? slugMatch[1] : "",
        title,
        url: this.toAbsolute(href),
        coverImage: cover ? cover[1] : undefined,
        rank,
      });
    });

    const results = matched.sort((a, b) => a.rank - b.rank).slice(0, 20);

    return Promise.all(
      results.map(async (series, index): Promise<SearchResult> => {
        const base: SearchResult = {
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter: 0,
          lastUpdated: "",
        };
        if (index >= 5) return base;

        try {
          const chapters = this.parseChapters(
            await this.fetchWithRetry(series.url),
          );
          const latest = chapters[chapters.length - 1];
          if (!latest) return base;
          return {
            ...base,
            latestChapter: latest.number,
            lastUpdated: latest.lastUpdated || "",
          };
        } catch (error) {
          console.error(
            `[Genz Toons] Failed to fetch chapter list for ${series.title}:`,
            error,
          );
          return base;
        }
      }),
    );
  }
}
