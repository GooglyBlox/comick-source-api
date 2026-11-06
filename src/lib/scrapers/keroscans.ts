import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

interface KeroSearchSeries {
  id: string;
  title: string;
  slug: string;
  urlSlug?: string;
  type?: string;
  coverImage?: string | null;
  rating?: number | null;
}

interface KeroSeriesChapter {
  number: number;
  url: string;
  lastUpdated?: string;
}

export class KeroScansScraper extends BaseScraper {
  private readonly BASE_URL = "https://keroscans.net";

  getName(): string {
    return "Kero Scans";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "scanlator";
  }

  canHandle(url: string): boolean {
    return url.includes("keroscans.net");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() || $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/series\/[^/]+\/([^/?#]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  private parseChapters(html: string, seriesPath: string): KeroSeriesChapter[] {
    const byNumber = new Map<number, KeroSeriesChapter>();
    const base = `${this.BASE_URL}${seriesPath}`;

    const pattern =
      /\\"number\\":(\d+(?:\.\d+)?),[^{}]*?\\"isLocked\\":(true|false),[^{}]*?\\"publishedAt\\":(?:null|\\"([^"\\]*)\\")[^{}]*?\\"hasAccess\\":(true|false)/g;
    let found = false;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html)) !== null) {
      found = true;
      const number = parseFloat(match[1]);
      if (match[2] === "true" || match[4] !== "true") continue;
      if (byNumber.has(number)) continue;
      byNumber.set(number, {
        number,
        url: `${base}/chapter/${match[1]}`,
        lastUpdated: match[3] || undefined,
      });
    }

    if (!found) {
      const $ = cheerio.load(html);
      $("a[href]").each((_, element) => {
        const href = $(element).attr("href") || "";
        const match = href.match(/\/chapter\/(\d+(?:\.\d+)?)\/?$/);
        if (!match || !href.includes(seriesPath)) return;
        const number = parseFloat(match[1]);
        if (!byNumber.has(number)) {
          byNumber.set(number, { number, url: `${base}/chapter/${match[1]}` });
        }
      });
    }

    return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
  }

  private getTotalPages(html: string): number {
    const match = html.match(/\\"totalPages\\":(\d+)/);
    return match ? Math.max(1, parseInt(match[1], 10)) : 1;
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    try {
      const pathMatch = mangaUrl.match(/\/series\/[^/]+\/[^/?#]+/);
      if (!pathMatch) {
        throw new Error(`Unrecognized series URL: ${mangaUrl}`);
      }
      const seriesPath = pathMatch[0];
      const seriesUrl = `${this.BASE_URL}${seriesPath}`;

      const firstHtml = await this.fetchWithRetry(seriesUrl);
      const totalPages = this.getTotalPages(firstHtml);

      const pages = [firstHtml];
      if (totalPages > 1) {
        const rest = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) =>
            this.fetchWithRetry(`${seriesUrl}?page=${index + 2}`),
          ),
        );
        pages.push(...rest);
      }

      const byNumber = new Map<number, KeroSeriesChapter>();
      for (const html of pages) {
        for (const chapter of this.parseChapters(html, seriesPath)) {
          if (!byNumber.has(chapter.number)) {
            byNumber.set(chapter.number, chapter);
          }
        }
      }

      return Array.from(byNumber.values())
        .sort((a, b) => a.number - b.number)
        .map((chapter) => ({
          id: `${chapter.number}`,
          number: chapter.number,
          title: `Chapter ${chapter.number}`,
          url: chapter.url,
          lastUpdated: chapter.lastUpdated,
        }));
    } catch (error) {
      console.error("[Kero Scans] Chapter fetch error:", error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch(
      `${this.BASE_URL}/api/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": this.config.userAgent,
          Accept: "application/json",
          Referer: `${this.BASE_URL}/`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: { series?: KeroSearchSeries[] } = await response.json();
    const series = (data.series || [])
      .filter((item) => !/novel/i.test(item.type || ""))
      .slice(0, 20);

    return Promise.all(
      series.map(async (item, index): Promise<SearchResult> => {
        const slug = item.urlSlug || item.slug;
        const seriesPath = `/series/comic/${slug}`;
        const url = `${this.BASE_URL}${seriesPath}`;

        let latestChapter = 0;
        let lastUpdated = "";
        let lastUpdatedTimestamp: number | undefined;

        if (index < 5) {
          try {
            const html = await this.fetchWithRetry(`${url}?sort=desc`);
            const chapters = this.parseChapters(html, seriesPath);
            const latest = chapters[chapters.length - 1];
            if (latest) {
              latestChapter = latest.number;
              if (latest.lastUpdated) {
                const parsed = new Date(latest.lastUpdated);
                if (!isNaN(parsed.getTime())) {
                  lastUpdatedTimestamp = parsed.getTime();
                  lastUpdated = parsed.toLocaleDateString();
                }
              }
            }
          } catch (error) {
            console.error("[Kero Scans] Latest chapter fetch error:", error);
          }
        }

        let coverImage: string | undefined;
        if (item.coverImage) {
          coverImage = item.coverImage.startsWith("http")
            ? item.coverImage
            : `${this.BASE_URL}${item.coverImage}`;
        }

        return {
          id: slug,
          title: item.title,
          url,
          coverImage,
          latestChapter,
          lastUpdated,
          lastUpdatedTimestamp,
          rating: item.rating ?? undefined,
        };
      }),
    );
  }
}
