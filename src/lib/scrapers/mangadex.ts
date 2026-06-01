/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MangaDexScraper extends BaseScraper {
  private readonly BASE_URL = "https://mangadex.org";
  private readonly API_URL = "https://api.mangadex.org";
  private readonly UPLOADS_URL = "https://uploads.mangadex.org";
  private readonly CONTENT_RATINGS = [
    "safe",
    "suggestive",
    "erotica",
    "pornographic",
  ];

  getName(): string {
    return "MangaDex";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  getType(): SourceType {
    return "aggregator";
  }

  canHandle(url: string): boolean {
    return url.includes("mangadex.org");
  }

  private pickTitle(attributes: any): string {
    const title = attributes?.title || {};
    if (title.en) return title.en;
    const firstKey = Object.keys(title)[0];
    if (firstKey) return title[firstKey];

    const alts: any[] = attributes?.altTitles || [];
    for (const alt of alts) {
      if (alt.en) return alt.en;
    }
    if (alts.length > 0) {
      const k = Object.keys(alts[0])[0];
      if (k) return alts[0][k];
    }
    return "Unknown";
  }

  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams();
    params.set("title", query);
    params.set("limit", "5");
    params.append("includes[]", "cover_art");
    params.set("order[relevance]", "desc");
    for (const r of this.CONTENT_RATINGS) params.append("contentRating[]", r);

    const response = await fetch(`${this.API_URL}/manga?${params.toString()}`, {
      headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const items: any[] = data.data || [];
    const results: SearchResult[] = [];

    for (const manga of items) {
      const id = manga.id;
      if (!id) continue;

      const title = this.pickTitle(manga.attributes);

      const cover = (manga.relationships || []).find(
        (r: any) => r.type === "cover_art",
      );
      const coverFile = cover?.attributes?.fileName;
      const coverImage = coverFile
        ? `${this.UPLOADS_URL}/covers/${id}/${coverFile}.256.jpg`
        : undefined;

      const latestChapter = manga.attributes?.lastChapter
        ? parseFloat(manga.attributes.lastChapter) || 0
        : 0;

      let lastUpdated = "";
      let lastUpdatedTimestamp: number | undefined;
      if (manga.attributes?.updatedAt) {
        const d = new Date(manga.attributes.updatedAt);
        if (!isNaN(d.getTime())) {
          lastUpdatedTimestamp = d.getTime();
          lastUpdated = d.toLocaleDateString();
        }
      }

      results.push({
        id,
        title,
        url: `${this.BASE_URL}/title/${id}`,
        coverImage,
        latestChapter,
        lastUpdated,
        lastUpdatedTimestamp,
      });
    }

    return results;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const idMatch = url.match(/\/title\/([0-9a-f-]{36})/i);
    const id = idMatch ? idMatch[1] : "";
    if (!id) {
      throw new Error("Could not extract MangaDex manga id from URL");
    }

    const response = await fetch(
      `${this.API_URL}/manga/${id}`,
      { headers: { "User-Agent": this.config.userAgent, Accept: "application/json" } },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { title: this.pickTitle(data.data?.attributes), id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const idMatch = mangaUrl.match(/\/title\/([0-9a-f-]{36})/i);
    const id = idMatch ? idMatch[1] : "";
    if (!id) {
      throw new Error("Could not extract MangaDex manga id from URL");
    }

    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();
    const limit = 500;
    let offset = 0;
    let total = 0;

    do {
      const params = new URLSearchParams();
      params.append("translatedLanguage[]", "en");
      params.set("order[chapter]", "asc");
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.append("includes[]", "scanlation_group");
      for (const r of this.CONTENT_RATINGS) params.append("contentRating[]", r);

      const response = await fetch(
        `${this.API_URL}/manga/${id}/feed?${params.toString()}`,
        { headers: { "User-Agent": this.config.userAgent, Accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const items: any[] = data.data || [];
      total = data.total || 0;

      for (const ch of items) {
        const attr = ch.attributes || {};
        if (attr.chapter == null) continue; // skip oneshots/ungrouped with no number

        const chapterNumber = parseFloat(attr.chapter);
        if (isNaN(chapterNumber) || seenChapterNumbers.has(chapterNumber)) continue;
        seenChapterNumbers.add(chapterNumber);

        const group = (ch.relationships || []).find(
          (r: any) => r.type === "scanlation_group",
        );

        chapters.push({
          id: ch.id,
          number: chapterNumber,
          title: attr.title || `Chapter ${attr.chapter}`,
          url: `${this.BASE_URL}/chapter/${ch.id}`,
          lastUpdated: attr.publishAt || undefined,
          group: group
            ? { id: group.id, name: group.attributes?.name || "Unknown" }
            : undefined,
        });
      }

      offset += limit;
    } while (offset < total);

    return chapters.sort((a, b) => a.number - b.number);
  }
}
