import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from "@/types";

export class ProjectSukiScraper extends BaseScraper {
  private readonly BASE_URL = "https://projectsuki.com";

  getName(): string {
    return "Project Suki";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("projectsuki.com");
  }

  getType(): SourceType {
    return "aggregator";
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/search?q=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".browse").each((_, element) => {
      const $item = $(element);

      const $titleLink = $item.find("h4 a");
      const title = $titleLink.text().trim();
      const href = $titleLink.attr("href");

      if (!title || !href) {
        return;
      }

      const urlMatch = href.match(/\/book\/(\d+)/);
      const id = urlMatch ? urlMatch[1] : "";

      if (!id) {
        return;
      }

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;

      const $coverImg = $item.find("img.browse");
      let coverImage = $coverImg.attr("src");
      if (coverImage && !coverImage.startsWith("http")) {
        coverImage = `${this.BASE_URL}${coverImage}`;
      }

      results.push({
        id,
        title,
        url: fullUrl,
        coverImage: coverImage || undefined,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    const limitedResults = results.slice(0, 5);

    const resultsWithChapterInfo = await Promise.all(
      limitedResults.map(async (result) => {
        try {
          const chapters = await this.getChapterList(result.url);
          if (chapters.length > 0) {
            const latestChapter = chapters[chapters.length - 1];
            return {
              ...result,
              latestChapter: latestChapter.number,
              lastUpdated: latestChapter.lastUpdated || "",
            };
          }
          return result;
        } catch {
          return result;
        }
      }),
    );

    return resultsWithChapterInfo;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h3").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/book\/(\d+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const bookIdMatch = mangaUrl.match(/\/book\/(\d+)/);
    const bookId = bookIdMatch ? bookIdMatch[1] : "";

    if (!bookId) {
      return [];
    }

    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];

    const chapterRows = $("tbody.table-borderless tr.row");

    chapterRows.each((_, element) => {
      const $row = $(element);

      const $chapterLink = $row.find('a[href*="/read/"]').first();
      const href = $chapterLink.attr("href");

      if (!href) {
        return;
      }

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;

      const chapterText = $chapterLink.text().trim();

      const chapterMatch = chapterText.match(
        /(?:Chapter|Ch\.?)\s+(\d+(?:\.\d+)?)/i,
      );
      let chapterNumber = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

      if (chapterNumber === 0) {
        const volChMatch = chapterText.match(
          /Vol\s+\d+,\s*Ch\.?\s*(\d+(?:\.\d+)?)/i,
        );
        chapterNumber = volChMatch ? parseFloat(volChMatch[1]) : 0;
      }

      if (chapterNumber === 0) {
        return;
      }

      const chapterTitle = chapterText || `Chapter ${chapterNumber}`;

      const $dateSpan = $row.find('span[itemtype*="dateCreated"]');
      const uploadDate = $dateSpan.attr("title") || $dateSpan.text().trim();

      chapters.push({
        id: `${chapterNumber}`,
        number: chapterNumber,
        title: chapterTitle,
        url: fullUrl,
        lastUpdated: uploadDate || undefined,
      });
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected override extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/\/read\/\d+\/(\d+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const $ = cheerio.load(html);
    const images: ChapterImage[] = [];

    $(".page-container img, .reader-area img, #reader img, .chapter-pages img").each((_, el) => {
      const url = $(el).attr("data-src")?.trim() || $(el).attr("src")?.trim();
      if (url && !url.includes("loading") && !url.includes("placeholder") && !url.includes("logo") && !url.includes("icon")) {
        images.push({ url, page: images.length + 1 });
      }
    });

    if (images.length === 0) {
      // Fallback: find all large images that look like manga pages
      $("img").each((_, el) => {
        const url = $(el).attr("data-src")?.trim() || $(el).attr("src")?.trim();
        if (url && /\.(jpg|jpeg|png|webp)/i.test(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar") && !url.includes("banner")) {
          images.push({ url, page: images.length + 1 });
        }
      });
    }

    return images;
  }
}
