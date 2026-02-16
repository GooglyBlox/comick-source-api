/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class WebtoonScraper extends BaseScraper {
  private readonly BASE_URL = "https://www.webtoons.com";

  getName(): string {
    return "WEBTOON";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("webtoons.com");
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $(".detail_header .subj").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").text().split("|")[0].trim();

    const titleNoMatch = url.match(/title_no=(\d+)/);
    const id = titleNoMatch ? titleNoMatch[1] : Date.now().toString();

    return { title, id };
  }

  private getAppLockedCount($: cheerio.CheerioAPI): number {
    const lockedText = $(".detail_install_app strong em").first().text().trim();
    return parseInt(lockedText, 10) || 0;
  }

  private buildListUrl(mangaUrl: string, page: number): string {
    const url = new URL(mangaUrl);
    if (!url.pathname.endsWith("/list")) {
      url.pathname = url.pathname.replace(/\/$/, "") + "/list";
    }
    url.searchParams.set("page", page.toString());
    return url.toString();
  }

  private parseChaptersFromPage(
    $: cheerio.CheerioAPI,
    chapters: ScrapedChapter[],
    seenEpisodes: Set<number>,
  ): void {
    $("#_listUl li._episodeItem").each((_: number, element: any) => {
      const $episode = $(element);
      const episodeNo = parseInt(
        $episode.attr("data-episode-no") || "0",
        10,
      );

      if (episodeNo <= 0 || seenEpisodes.has(episodeNo)) return;

      const $link = $episode.find("a").first();
      const href = $link.attr("href") || "";

      if (!href) return;

      const fullUrl = href.startsWith("http")
        ? href
        : `${this.BASE_URL}${href}`;
      const title = $episode.find(".subj span").first().text().trim();
      const dateText = $episode.find(".date").text().trim();

      seenEpisodes.add(episodeNo);
      chapters.push({
        id: `${episodeNo}`,
        number: episodeNo,
        title: title || `Episode ${episodeNo}`,
        url: fullUrl,
        lastUpdated: dateText || undefined,
      });
    });
  }

  private hasHigherPage(
    $: cheerio.CheerioAPI,
    currentPage: number,
  ): boolean {
    let found = false;
    $(".paginate a span").each((_: number, element: any) => {
      const num = parseInt($(element).text().trim(), 10);
      if (!isNaN(num) && num > currentPage) {
        found = true;
        return false;
      }
    });
    return found;
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenEpisodes = new Set<number>();

    try {
      let page = 1;

      while (true) {
        const pageUrl = this.buildListUrl(mangaUrl, page);
        const html = await this.fetchWithRetry(pageUrl);
        const $ = cheerio.load(html);

        const beforeCount = chapters.length;
        this.parseChaptersFromPage($, chapters, seenEpisodes);

        if (chapters.length === beforeCount) break;

        const hasNextPage = $(".paginate a.pg_next").length > 0;
        const hasHigherPages = this.hasHigherPage($, page);

        if (!hasNextPage && !hasHigherPages) break;

        page++;
      }
    } catch (error) {
      console.error("[WEBTOON] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  private async fetchLatestChapterInfo(
    listUrl: string,
  ): Promise<{ latestChapter: number; lastUpdated: string }> {
    try {
      const pageUrl = this.buildListUrl(listUrl, 1);
      const html = await this.fetchWithRetry(pageUrl);
      const $ = cheerio.load(html);

      const appLockedCount = this.getAppLockedCount($);

      let highestEpisode = 0;
      let latestDate = "";

      $("#_listUl li._episodeItem").each((_: number, element: any) => {
        const episodeNo = parseInt(
          $(element).attr("data-episode-no") || "0",
          10,
        );
        if (episodeNo > highestEpisode) {
          highestEpisode = episodeNo;
          latestDate = $(element).find(".date").text().trim();
        }
      });

      return {
        latestChapter: highestEpisode + appLockedCount,
        lastUpdated: latestDate,
      };
    } catch {
      return { latestChapter: 0, lastUpdated: "" };
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/en/search?keyword=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    const basicResults: {
      title: string;
      url: string;
      coverImage?: string;
      id: string;
    }[] = [];

    $(".webtoon_list li")
      .slice(0, 5)
      .each((_: number, element: any) => {
        const $item = $(element);
        const $link = $item.find("a.link").first();

        const url = $link.attr("href") || "";
        if (!url) return;

        const fullUrl = url.startsWith("http")
          ? url
          : `${this.BASE_URL}${url}`;
        const title = $item.find(".title").text().trim();
        const coverImage = $item.find(".image_wrap img").attr("src");
        const titleNo = $link.attr("data-title-no") || "";

        basicResults.push({
          title,
          url: fullUrl,
          coverImage,
          id: titleNo,
        });
      });

    const chapterInfoPromises = basicResults.map((result) =>
      this.fetchLatestChapterInfo(result.url),
    );
    const chapterInfos = await Promise.all(chapterInfoPromises);

    for (let i = 0; i < basicResults.length; i++) {
      const basic = basicResults[i];
      const chapterInfo = chapterInfos[i];

      results.push({
        id: basic.id,
        title: basic.title,
        url: basic.url,
        coverImage: basic.coverImage,
        latestChapter: chapterInfo.latestChapter,
        lastUpdated: chapterInfo.lastUpdated,
      });
    }

    return results;
  }
}
