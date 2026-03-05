/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class FlameComicsScraper extends BaseScraper {
  private readonly BASE_URL = "https://flamecomics.xyz";
  private readonly CDN_URL = "https://cdn.flamecomics.xyz";
  private readonly API_URL = "https://flamecomics.xyz/api/series";

  getName(): string {
    return "FlameComics";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("flamecomics.xyz");
  }

  getType(): SourceType {
    return "scanlator";
  }

  /**
   * Format a date as relative time (e.g., "5d ago", "3h ago")
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
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

  /**
   * Fetch timestamp from the series page's first chapter
   */
  private async getSeriesLastUpdated(seriesUrl: string): Promise<string> {
    try {
      const html = await this.fetchWithRetry(seriesUrl);
      const $ = cheerio.load(html);

      // Find chapter cards using the specific class
      const firstChapterCard = $(".ChapterCard_chapterWrapper__YjOzx").first();

      if (firstChapterCard.length === 0) {
        return "Unknown";
      }

      // Find the paragraph with data-size="xs" that has a title attribute
      const timeElement = firstChapterCard
        .find('p[data-size="xs"][title]')
        .first();
      const timeTitle = timeElement.attr("title");

      if (timeTitle) {
        const date = new Date(timeTitle);
        return this.formatRelativeTime(date);
      }
    } catch (error) {
      console.error(`Failed to fetch timestamp for ${seriesUrl}:`, error);
    }
    return "Unknown";
  }

  /**
   * Search for manga on FlameComics using their API
   */
  async search(query: string): Promise<SearchResult[]> {
    try {
      // Fetch the series list from the API
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const seriesList = await response.json();

      if (!Array.isArray(seriesList)) {
        throw new Error("Invalid API response format");
      }

      // Filter series based on search query
      const searchQuery = query.toLowerCase().trim();
      const matchedSeries = seriesList.filter((series) => {
        const title = series.label || "";
        return title.toLowerCase().includes(searchQuery);
      });

      // Fetch timestamps for all matched series
      const results: SearchResult[] = await Promise.all(
        matchedSeries.map(async (series) => {
          const seriesUrl = `${this.BASE_URL}/series/${series.id}`;
          const lastUpdated = await this.getSeriesLastUpdated(seriesUrl);

          return {
            id: series.id.toString(),
            title: series.label || "",
            url: seriesUrl,
            coverImage: series.image
              ? `${this.CDN_URL}/uploads/images/series/${series.id}/${series.image}`
              : undefined,
            latestChapter: parseInt(series.chapter_count) || 0,
            lastUpdated: lastUpdated,
          };
        }),
      );

      // Sort by latest chapter count
      return results.sort((a, b) => b.latestChapter - a.latestChapter);
    } catch (error) {
      console.error("FlameComics search error:", error);
      throw error;
    }
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    // Try __NEXT_DATA__ first
    const nextDataScript = $("#__NEXT_DATA__").html();
    if (nextDataScript) {
      try {
        const data = JSON.parse(nextDataScript);
        const chapter = data.props?.pageProps?.chapter;
        if (chapter?.images) {
          const seriesId = data.props?.pageProps?.series?.id || "";
          const chapterHash = chapter.hash || chapter.id || "";
          const imageEntries = Object.values(chapter.images) as { name: string }[];
          return imageEntries.map((img, index) => ({
            url: `${this.CDN_URL}/uploads/images/series/${seriesId}/${chapterHash}/${img.name}`,
            page: index + 1,
          }));
        }
      } catch {}
    }

    // Fallback: direct img tags
    $("img[src*='cdn.flamecomics']").each((_, el) => {
      const url = $(el).attr("src")?.trim();
      if (url) {
        images.push({ url, page: images.length + 1 });
      }
    });

    return images;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    // Try to extract title from the page
    let title = $("h1").first().text().trim();
    if (!title) {
      title = $("title").text().split(" - ")[0].trim();
    }

    // Extract series ID from URL pattern: /series/{id}
    const urlMatch = url.match(/\/series\/(\d+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    // Find all chapter links - they have href="/series/{series_id}/{chapter_id}"
    $('a[href*="/series/"]').each((_: number, element: any) => {
      const $link = $(element);
      const href = $link.attr("href");

      if (!href) return;

      // Skip if it's just the series page (no chapter ID)
      const pathParts = href.split("/");
      if (pathParts.length < 4) return;

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;

      // Try to extract chapter number from data-mal-sync-episode attribute
      const episodeAttr = $link.attr("data-mal-sync-episode");
      let chapterNumber = episodeAttr ? parseFloat(episodeAttr) : -1;

      // Fallback: extract from chapter title text
      if (chapterNumber < 0) {
        const chapterText = $link.text();
        const chapterMatch = chapterText.match(/Chapter\s+(\d+(?:\.\d+)?)/i);
        if (chapterMatch) {
          chapterNumber = parseFloat(chapterMatch[1]);
        }
      }

      // Skip if we couldn't find a chapter number or if it's a duplicate
      if (chapterNumber < 0 || seenChapterNumbers.has(chapterNumber)) return;

      seenChapterNumbers.add(chapterNumber);

      // Extract chapter title
      const titleElement = $link.find('p[data-size="md"]').first();
      const chapterTitle =
        titleElement.text().trim() || `Chapter ${chapterNumber}`;

      chapters.push({
        id: `${chapterNumber}`,
        number: chapterNumber,
        title: chapterTitle,
        url: fullUrl,
      });
    });

    return chapters.sort((a, b) => a.number - b.number);
  }
}
