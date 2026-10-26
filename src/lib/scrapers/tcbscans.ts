/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class TCBScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://tcbonepiecechapters.com";

  getName(): string {
    return "TCB Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return (
      url.includes("tcbonepiecechapters.com") ||
      url.includes("onepiecechapters.com") ||
      url.includes("tcbscans")
    );
  }

  private absolute(href: string): string {
    return href.startsWith("http")
      ? href
      : `${this.BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split("|")[0].trim();

    const urlMatch = url.match(/\/mangas\/(\d+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $("a[href*='/chapters/']").each((_: number, element: any) => {
        const $link = $(element);
        const href = $link.attr("href");
        if (!href) return;

        const heading = $link.children().first().text().replace(/\s+/g, " ").trim();
        const subtitle = $link.children().eq(1).text().replace(/\s+/g, " ").trim();

        let chapterNumber = -1;
        const textMatch = heading.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
        if (textMatch) {
          chapterNumber = parseFloat(textMatch[1]);
        } else {
          const urlMatch = href.match(/chapter-(\d+)(?:-(\d+))?/i);
          if (urlMatch) {
            chapterNumber = parseFloat(
              urlMatch[2] ? `${urlMatch[1]}.${urlMatch[2]}` : urlMatch[1]
            );
          }
        }

        if (chapterNumber <= 0 || seenChapterNumbers.has(chapterNumber)) return;
        seenChapterNumbers.add(chapterNumber);

        chapters.push({
          id: `${chapterNumber}`,
          number: chapterNumber,
          title: subtitle || heading || `Chapter ${chapterNumber}`,
          url: this.absolute(href),
        });
      });
    } catch (error) {
      console.error("[TCBScans] Chapter fetch error:", error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async search(query: string): Promise<SearchResult[]> {
    const html = await this.fetchWithRetry(`${this.BASE_URL}/projects`);
    const $ = cheerio.load(html);
    const needle = query.trim().toLowerCase();

    const matched: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
    }> = [];
    const seen = new Set<string>();

    $("a[href*='/mangas/']").each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");
      const title = $link.text().trim();
      if (!href || !title || seen.has(href)) return;

      if (needle && !title.toLowerCase().includes(needle)) return;
      seen.add(href);

      const idMatch = href.match(/\/mangas\/(\d+)/);
      const img = $link.closest("div.flex-col, div.flex").parent().find("img").first();
      const cover = img.attr("src");

      matched.push({
        id: idMatch ? idMatch[1] : href,
        title,
        url: this.absolute(href),
        coverImage: cover ? this.absolute(cover) : undefined,
      });
    });

    const limited = matched.slice(0, 20);
    const latestNumbers = await Promise.all(
      limited.slice(0, 5).map(async (series) => {
        try {
          const chapters = await this.getChapterList(series.url);
          return chapters.length > 0 ? chapters[chapters.length - 1].number : 0;
        } catch (error) {
          console.error(
            `[TCBScans] Failed to fetch chapter list for ${series.title}:`,
            error
          );
          return 0;
        }
      })
    );

    return limited.map((series, index) => ({
      id: series.id,
      title: series.title,
      url: series.url,
      coverImage: series.coverImage,
      latestChapter: latestNumbers[index] ?? 0,
      lastUpdated: "",
    }));
  }
}
