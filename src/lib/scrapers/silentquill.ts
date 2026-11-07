import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class SilentQuillScraper extends BaseScraper {
  private readonly BASE_URL = "https://silentquill.net";

  getName(): string {
    return "KDT Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("silentquill.net");
  }

  private normalizeUrl(url: string): string {
    return url.replace(/^(https?:\/\/)www\.silentquill\.net/i, "$1silentquill.net");
  }

  private extractSlug(url: string): string | null {
    const match = url.match(/silentquill\.net\/series\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.extractSlug(url);
    const html = await this.fetchWithRetry(this.normalizeUrl(url));
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(/\s[-|]\s/)[0].trim();

    return { title, id: slug || Date.now().toString() };
  }

  private parseChapters(html: string, slug: string): ScrapedChapter[] {
    const pattern =
      /\\"slug\\":\\"([^"\\]+)\\",\\"chapter_no\\":\\"([^"\\]+)\\"(?:,\\"subtitle\\":(?:null|\\"([^"\\]*)\\"))?/g;
    const chapters = new Map<number, ScrapedChapter>();
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      const [, chapterSlug, chapterNo, subtitle] = match;
      if (!chapterSlug.startsWith(`${slug}-`)) continue;

      const number = parseFloat(chapterNo);
      if (isNaN(number) || number < 0 || chapters.has(number)) continue;

      chapters.set(number, {
        id: `${number}`,
        number,
        title: subtitle ? `Chapter ${number} - ${subtitle}` : `Chapter ${number}`,
        url: `${this.BASE_URL}/${chapterSlug}/`,
      });
    }

    return Array.from(chapters.values()).sort((a, b) => a.number - b.number);
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.extractSlug(mangaUrl);
    if (!slug) {
      throw new Error(`Invalid KDT Scans URL: ${mangaUrl}`);
    }

    try {
      const html = await this.fetchWithRetry(`${this.BASE_URL}/series/${slug}/`);
      return this.parseChapters(html, slug);
    } catch (error) {
      console.error("[SilentQuill] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const response = await fetch(
        `${this.BASE_URL}/api/suggest/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent": this.config.userAgent,
            Accept: "application/json",
            Referer: `${this.BASE_URL}/`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items: Array<{ slug: string; title: string; cover_url?: string }> =
        data.items || [];

      return await Promise.all(
        items.slice(0, 5).map(async (item) => {
          const url = `${this.BASE_URL}/series/${item.slug}/`;
          let latestChapter = 0;

          try {
            const chapters = await this.getChapterList(url);
            if (chapters.length > 0) {
              latestChapter = chapters[chapters.length - 1].number;
            }
          } catch (error) {
            console.error(`[SilentQuill] Error fetching chapters for ${url}:`, error);
          }

          return {
            id: item.slug,
            title: item.title,
            url,
            coverImage: item.cover_url,
            latestChapter,
            lastUpdated: "",
          };
        })
      );
    } catch (error) {
      console.error("[SilentQuill] Search error:", error);
      throw error;
    }
  }
}
