/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

export class MangaParkScraper extends BaseScraper {
  getName(): string {
    return "MangaPark";
  }

  getBaseUrl(): string {
    return "https://mangapark.io";
  }

  canHandle(url: string): boolean {
    return url.includes("mangapark.io") || url.includes("mangapark.net");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $(".title").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/title\/(\d+)-/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    const chapterSelectors = [
      'a[href*="/title/"]',
      ".chapter-item a",
      ".episode-item a",
    ];

    for (const selector of chapterSelectors) {
      const links = $(selector);

      if (links.length > 0) {
        links.each((_: number, element: any) => {
          const $link = $(element);
          const href = $link.attr("href");

          if (href && /\/title\/\d+[^/]*\/\d+-[a-z]+-\d+/i.test(href)) {
            const fullUrl = href.startsWith("http")
              ? href
              : `https://mangapark.io${href}`;
            const chapterNumber = this.extractChapterNumber(fullUrl);

            if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
              seenChapterNumbers.add(chapterNumber);
              chapters.push({
                id: `${chapterNumber}`,
                number: chapterNumber,
                title: undefined,
                url: fullUrl,
              });
            }
          }
        });
        break;
      }
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/\d+-chapter[/-](\d+)(?:[-.\/](\d+))?/i,
      /\/\d+-ch[/-](\d+)(?:[-.\/](\d+))?/i,
      /vol-\d+-ch-(\d+)(?:[-.\/](\d+))?/i,
      /\/\d+-episode[/-](\d+)(?:[-.\/](\d+))?/i,
      /\/\d+-[a-z]+-(\d+)(?:[-.\/](\d+))?$/i,
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
    const searchUrl = `https://mangapark.io/search?word=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("div.flex.border-b.border-b-base-200.pb-5").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find("h3 a.link-hover.link-pri").first();
      const url = titleLink.attr("href");

      if (!url) return;

      const fullUrl = url.startsWith("http")
        ? url
        : `https://mangapark.io${url}`;
      const title = titleLink.text().trim();

      const idMatch = url.match(/\/title\/(\d+)/);
      const id = idMatch ? idMatch[1] : "";

      const coverImg = $item.find("img").first();
      const coverImage = coverImg.attr("src");

      const allLinks = $item.find('a[href*="/title/"]');
      const latestChapterLink = allLinks
        .filter((_, el) => {
          const href = $(el).attr("href");
          return !!(href && /\/title\/\d+[^/]*\/\d+-[a-z]+-\d+/i.test(href));
        })
        .last();

      const latestChapterText = latestChapterLink.text().trim();

      const chapterPatterns = [
        /Chapter\s+([\d.]+)/i,
        /Ch\.?\s+([\d.]+)/i,
        /Episode\s+([\d.]+)/i,
        /\b([a-z]+)\s+([\d.]+)\b/i,
      ];

      let latestChapter = 0;
      for (const pattern of chapterPatterns) {
        const match = latestChapterText.match(pattern);
        if (match) {
          latestChapter = parseFloat(match[match.length - 1]);
          break;
        }
      }

      const timeElement = $item.find("time[data-time]");
      const lastUpdatedTimestamp = timeElement.attr("data-time");
      const lastUpdatedText = timeElement.find("span").text().trim();

      const ratingSpan = $item.find(".text-yellow-500 span.font-bold");
      const rating =
        ratingSpan.length > 0
          ? parseFloat(ratingSpan.text().trim())
          : undefined;

      const followersSpan = $item
        .find('[id^="comic-follow-swap"] span.ml-1')
        .first();
      const followersText = followersSpan.text().trim();

      results.push({
        id,
        title,
        url: fullUrl,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : `https://mangapark.io${coverImage}`,
        latestChapter,
        lastUpdated: lastUpdatedText,
        lastUpdatedTimestamp: lastUpdatedTimestamp
          ? parseInt(lastUpdatedTimestamp)
          : undefined,
        rating,
        followers: followersText,
      });
    });

    return results;
  }
}
