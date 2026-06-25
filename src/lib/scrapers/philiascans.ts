/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class PhiliascansScraper extends BaseScraper {
  private readonly BASE_URL = "https://philiascans.org";

  getName(): string {
    return "Philia Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("philiascans.org");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slugMatch = url.match(/\/series\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1] : "";

    try {
      const res = await fetch(`${this.BASE_URL}/api/manga/${slug}`, {
        headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        return { title: data.title || slug, id: slug || String(data.id) };
      }
    } catch {
      // fall through to slug-based fallback
    }

    return {
      title: slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
      id: slug || Date.now().toString(),
    };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slugMatch = mangaUrl.match(/\/series\/([^/?#]+)/);
    const slug = slugMatch ? slugMatch[1] : "";
    if (!slug) return [];

    // New Philia (Next.js) site exposes a JSON API for chapters.
    const res = await fetch(`${this.BASE_URL}/api/manga/${slug}/chapters`, {
      headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const items: any[] = data.items || data.chapters || [];
    const chapters: ScrapedChapter[] = [];
    const seen = new Set<number>();

    for (const it of items) {
      const number = parseFloat(it.number);
      if (isNaN(number) || seen.has(number)) continue;
      seen.add(number);

      chapters.push({
        id: String(it.id ?? number),
        number,
        title: it.title || `Chapter ${it.number}`,
        url: `${this.BASE_URL}/series/${slug}/${it.slug}`,
        lastUpdated: it.publishedAt || undefined,
      });
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /chapter[/-](\d+)(?:[.-](\d+))?/i,
      /\/(\d+(?:[.-]\d+)?)\/?$/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? parseInt(match[2], 10) : 0;

        if (decimalPart > 0) {
          return mainNumber + decimalPart / 10;
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    // Philia migrated to a Next.js site. Search is a server-rendered GET at
    // /all-mangas?s=QUERY; results are <a class="manga-card" href="/series/slug">.
    const searchUrl = `${this.BASE_URL}/all-mangas?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];

    $("a.manga-card").each((_, element) => {
      const $card = $(element);
      const href = $card.attr("href");
      if (!href || !href.includes("/series/")) return;

      const url = href.startsWith("http") ? href : `${this.BASE_URL}${href}`;
      const slugMatch = url.match(/\/series\/([^/?#]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const $img = $card.find("img").first();
      let coverImage = $img.attr("src") || $img.attr("data-src") || undefined;
      if (coverImage && coverImage.startsWith("/")) {
        coverImage = `${this.BASE_URL}${coverImage}`;
      }

      const title =
        $card.find("[class*='title'], .manga-card-title, h3, h2").first().text().trim() ||
        $img.attr("alt")?.trim() ||
        "";

      if (!title) return;

      results.push({
        id,
        title,
        url,
        coverImage,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    return results.slice(0, 5);
  }
}
