import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult } from "@/types";

interface MKissaDate {
  year?: number;
  month?: number;
  date?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

interface MKissaManga {
  _id: string;
  name: string;
  englishName?: string | null;
  thumbnail?: string | null;
  lastChapterDate?: { sub?: MKissaDate | null } | null;
  availableChaptersDetail?: { sub?: string[] | null } | null;
}

const MANGA_FIELDS =
  "_id name englishName thumbnail lastChapterDate availableChaptersDetail";

export class MKissaScraper extends BaseScraper {
  private readonly API_URL = "https://api.mkissa.net/api";
  private readonly COVER_URL = "https://aln.youtube-anime.com";

  getName(): string {
    return "MKissa";
  }

  getBaseUrl(): string {
    return "https://mkissa.to";
  }

  canHandle(url: string): boolean {
    return url.includes("mkissa.to");
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(this.API_URL, {
          method: "POST",
          headers: {
            "User-Agent": this.config.userAgent,
            Accept: "application/json",
            "Content-Type": "application/json",
            Origin: this.getBaseUrl(),
            Referer: `${this.getBaseUrl()}/`,
          },
          body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        if (json.errors?.length) {
          throw new Error(json.errors[0].message || "GraphQL error");
        }
        return json.data as T;
      } catch (error) {
        if (attempt === this.config.retryAttempts) throw error;
        await this.delay(this.config.downloadDelay * (attempt + 1));
      }
    }
    throw new Error("Failed to fetch after retries");
  }

  private getMangaId(url: string): string | null {
    const match = url.match(/\/manga\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
  }

  private getTitle(manga: MKissaManga): string {
    return (manga.englishName || manga.name || "").trim();
  }

  private getNumbers(manga: MKissaManga): number[] {
    const numbers = new Set<number>();
    for (const raw of manga.availableChaptersDetail?.sub || []) {
      const value = parseFloat(raw);
      if (!isNaN(value)) numbers.add(value);
    }
    return Array.from(numbers).sort((a, b) => a - b);
  }

  private getTimestamp(date?: MKissaDate | null): number | undefined {
    if (!date || !date.year) return undefined;
    return Date.UTC(
      date.year,
      date.month ?? 0,
      date.date ?? 1,
      date.hour ?? 0,
      date.minute ?? 0,
      date.second ?? 0,
    );
  }

  private formatRelativeTime(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    if (days < 365) {
      const months = Math.floor(days / 30);
      return `${months} month${months === 1 ? "" : "s"} ago`;
    }
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? "" : "s"} ago`;
  }

  private getCoverUrl(thumbnail?: string | null): string | undefined {
    if (!thumbnail) return undefined;
    if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
    return `${this.COVER_URL}/${thumbnail.replace(/^\//, "")}`;
  }

  private chapterUrl(id: string, raw: string): string {
    return `${this.getBaseUrl()}/manga/${id}/chapter-${raw}-sub`;
  }

  private async fetchManga(id: string): Promise<MKissaManga | null> {
    const data = await this.graphql<{ manga: MKissaManga | null }>(
      `query($id:String!){manga(_id:$id){${MANGA_FIELDS}}}`,
      { id },
    );
    return data.manga;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const id = this.getMangaId(url);
    if (!id) {
      throw new Error("Could not extract manga id from URL");
    }

    const manga = await this.fetchManga(id);
    return { title: manga ? this.getTitle(manga) : id, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const id = this.getMangaId(mangaUrl);
    if (!id) return [];

    try {
      const manga = await this.fetchManga(id);
      if (!manga) return [];

      const raws = manga.availableChaptersDetail?.sub || [];
      const byNumber = new Map<number, string>();
      for (const raw of raws) {
        const value = parseFloat(raw);
        if (isNaN(value) || byNumber.has(value)) continue;
        byNumber.set(value, raw);
      }

      return Array.from(byNumber.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([number, raw]) => ({
          id: raw,
          number,
          title: `Chapter ${raw}`,
          url: this.chapterUrl(id, raw),
        }));
    } catch (error) {
      console.error("[MKissa] Chapter fetch error:", error);
      return [];
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.graphql<{ mangas: { edges: MKissaManga[] } }>(
      `query($search:SearchInput,$limit:Int,$page:Int){mangas(search:$search,limit:$limit,page:$page,translationType:sub,countryOrigin:ALL){edges{${MANGA_FIELDS}}}}`,
      { search: { query, isManga: true }, limit: 20, page: 1 },
    );

    const results: SearchResult[] = [];

    for (const manga of data.mangas?.edges || []) {
      const numbers = this.getNumbers(manga);
      if (numbers.length === 0) continue;

      const timestamp = this.getTimestamp(manga.lastChapterDate?.sub);

      results.push({
        id: manga._id,
        title: this.getTitle(manga),
        url: `${this.getBaseUrl()}/manga/${manga._id}`,
        coverImage: this.getCoverUrl(manga.thumbnail),
        latestChapter: numbers[numbers.length - 1],
        lastUpdated: timestamp ? this.formatRelativeTime(timestamp) : "",
        lastUpdatedTimestamp: timestamp,
      });
    }

    return results.slice(0, 20);
  }
}
