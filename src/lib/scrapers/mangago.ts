import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MangagoScraper extends BaseScraper {
  private readonly BASE_URL = "https://www.mangago.zone";
  private readonly SEARCH_URL = "https://www.mangago.me";

  getName(): string {
    return "Mangago";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("mangago.zone") || url.includes("mangago.me");
  }

  getType(): SourceType {
    return "aggregator";
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.SEARCH_URL}/r/l_search/?name=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("#search_list li").each((_, element) => {
      const $item = $(element);

      const $titleLink = $item.find("h2 a").first();
      const title = $titleLink.text().trim();
      const href = $titleLink.attr("href");

      if (!title || !href) return;

      const url = href.replace(
        "mangago.me/read-manga/",
        "mangago.zone/read-manga/",
      );

      const urlMatch = url.match(/\/read-manga\/([^/]+)/);
      const id = urlMatch ? urlMatch[1] : "";

      if (!id) return;

      const $coverImg = $item.find(".left img").first();
      const coverImage = $coverImg.attr("src");

      let latestChapter = 0;
      const $latestChaptersDiv = $item.find(".row-5.gray").filter((_, el) => {
        return $(el).find(".blue").text().includes("Latest Chapters:");
      });

      if ($latestChaptersDiv.length > 0) {
        const $firstChapterLink = $latestChaptersDiv.find("a.chico").first();
        const chapterText = $firstChapterLink.text().trim();
        const chapterMatch = chapterText.match(/Ch\.?\s*(\d+(?:\.\d+)?)/i);
        if (chapterMatch) {
          latestChapter = parseFloat(chapterMatch[1]);
        }
      }

      results.push({
        id,
        title,
        url,
        coverImage: coverImage || undefined,
        latestChapter,
        lastUpdated: "",
      });
    });

    const topResults = results.slice(0, 5);

    const resultsWithDates = await Promise.all(
      topResults.map(async (result) => {
        try {
          const chapterListUrl = `${this.BASE_URL}/read-manga/${result.id}/`;
          const chapterHtml = await this.fetchWithRetry(chapterListUrl);
          const $chapter = cheerio.load(chapterHtml);

          const $firstRow = $chapter("#chapter_table tbody tr").first();
          const dateText = $firstRow.find("td.no").last().text().trim();

          if (dateText) {
            const date = new Date(dateText);
            return {
              ...result,
              lastUpdated: dateText,
              lastUpdatedTimestamp: !isNaN(date.getTime())
                ? date.getTime()
                : undefined,
            };
          }

          return result;
        } catch (error) {
          console.error(
            `[Mangago] Error fetching chapter info for ${result.title}:`,
            error,
          );
          return result;
        }
      }),
    );

    return resultsWithDates;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/read-manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $("#chapter_table tbody tr").each((_, element) => {
      const $row = $(element);

      const $chapterLink = $row.find("a.chico").first();
      const href = $chapterLink.attr("href");
      const chapterText = $chapterLink.text().trim();

      if (!href || !chapterText) return;

      const chapterMatch = chapterText.match(/Ch\.?\s*(\d+(?:\.\d+)?)/i);
      if (!chapterMatch) return;

      const chapterNumber = parseFloat(chapterMatch[1]);

      if (seenChapterNumbers.has(chapterNumber)) return;

      seenChapterNumbers.add(chapterNumber);

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;

      chapters.push({
        id: `${chapterNumber}`,
        number: chapterNumber,
        title: chapterText,
        url: fullUrl,
      });
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected override extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/\/chapter\/\d+\/(\d+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const images: ChapterImage[] = [];

    // Try to find image array in JavaScript
    const imgsMatch = html.match(/imgsrcs\s*=\s*(\[[\s\S]*?\]);/) ||
                      html.match(/var\s+imgs\s*=\s*(\[[\s\S]*?\]);/);
    if (imgsMatch) {
      try {
        const imgUrls: string[] = JSON.parse(imgsMatch[1].replace(/'/g, '"'));
        for (const url of imgUrls) {
          if (url && url.startsWith("http")) {
            images.push({ url, page: images.length + 1 });
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (images.length > 0) return images;

    // Fallback: parse img tags from the reader
    const $ = cheerio.load(html);
    $("#page1, #page2, #page3, .page-img, #viewer").find("img").each((_, el) => {
      const url = $(el).attr("data-src")?.trim() || $(el).attr("src")?.trim();
      if (url && url.startsWith("http") && !url.includes("logo") && !url.includes("icon")) {
        images.push({ url, page: images.length + 1 });
      }
    });

    if (images.length === 0) {
      // Try all img tags with manga content URLs
      $("img").each((_, el) => {
        const url = $(el).attr("src")?.trim();
        if (url && /\.(jpg|jpeg|png|webp)/i.test(url) && (url.includes("manga") || url.includes("chapter") || url.includes("comic")) && !url.includes("logo") && !url.includes("icon")) {
          images.push({ url, page: images.length + 1 });
        }
      });
    }

    return images;
  }
}
