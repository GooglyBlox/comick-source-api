/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface LuminareChapter {
  url: string;
  number: number;
  title: string;
  date?: string;
}

export class LuminareScraper extends BaseScraper {
  private readonly BASE_URL = "https://luminaretranslations.com";
  private readonly MANGA_TYPE_ID = 39;

  getName(): string {
    return "Luminare Translations";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("luminaretranslations.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().replace(/\s+/g, " ").trim() ||
      $("title").text().split(/ [-|] /)[0].trim();

    const urlMatch = url.match(/\/series\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  private parseChapters(html: string): LuminareChapter[] {
    const $ = cheerio.load(html);
    const raw = $("[x-data]")
      .map((_: number, el: any) => $(el).attr("x-data") || "")
      .get()
      .find((value: string) => value.includes("chapters:"));
    if (!raw) return [];

    const match = raw.match(/chapters:\s*(\[[\s\S]*?\])\s*,\s*\n/);
    if (!match) return [];

    let items: any[];
    try {
      items = JSON.parse(match[1]);
    } catch {
      return [];
    }

    const seen = new Set<number>();
    const chapters: LuminareChapter[] = [];

    for (const item of items) {
      const number = Number(item?.number);
      const url = typeof item?.url === "string" ? item.url : "";
      if (!url || !Number.isFinite(number) || number < 0 || seen.has(number)) {
        continue;
      }
      seen.add(number);

      const subtitle = typeof item.subtitle === "string" ? item.subtitle.trim() : "";
      chapters.push({
        url: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
        number,
        title: subtitle ? `Chapter ${number}: ${subtitle}` : `Chapter ${number}`,
        date: typeof item.published_at === "string" ? item.published_at : undefined,
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
        title: chapter.title,
        url: chapter.url,
        lastUpdated: chapter.date,
      }));
    } catch (error) {
      console.error("[Luminare Translations] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/wp-json/wp/v2/series?search=${encodeURIComponent(query)}&series_type=${this.MANGA_TYPE_ID}&per_page=20&_fields=slug,link,title`;
    const hits: Array<{ slug?: string; link?: string; title?: { rendered?: string } }> =
      JSON.parse(await this.fetchWithRetry(searchUrl));

    const results: SearchResult[] = [];
    const seenIds = new Set<string>();

    for (const hit of hits) {
      const url = hit.link || "";
      const id = hit.slug || url.match(/\/series\/([^/?#]+)/)?.[1] || "";
      const title = cheerio
        .load(hit.title?.rendered || "")
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (!url || !id || !title || seenIds.has(id)) continue;
      seenIds.add(id);

      results.push({ id, title, url, latestChapter: 0, lastUpdated: "" });
    }

    await Promise.all(
      results.slice(0, 5).map(async (result) => {
        try {
          const html = await this.fetchWithRetry(result.url);
          const $ = cheerio.load(html);
          result.coverImage =
            $('meta[property="og:image"]').attr("content") || undefined;

          const latest = this.parseChapters(html).pop();
          if (latest) {
            result.latestChapter = latest.number;
            result.lastUpdated = latest.date || "";
          }
        } catch (error) {
          console.error(
            `[Luminare Translations] Failed to fetch chapter list for ${result.title}:`,
            error
          );
        }
      })
    );

    return results.slice(0, 20);
  }
}
