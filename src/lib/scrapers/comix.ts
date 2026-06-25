/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from './base';
import { ScrapedChapter, SearchResult, SourceType } from '@/types';

export class ComixScraper extends BaseScraper {
  private readonly baseUrl = 'https://comix.to';
  private readonly apiBase = 'https://comix.to/api/v1';

  getName(): string {
    return 'Comix';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getType(): SourceType {
    return 'aggregator';
  }

  canHandle(url: string): boolean {
    return url.includes('comix.to');
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/(?:comic|title)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid Comix URL format');
    }

    const hashId = urlMatch[1].split('-')[0];

    try {
      const response = await fetch(`${this.apiBase}/manga/${hashId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        title: data.result?.title || hashId,
        id: hashId
      };
    } catch (error) {
      console.error('[Comix] Error extracting manga info:', error);
      return {
        title: hashId,
        id: hashId
      };
    }
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    const urlMatch = mangaUrl.match(/\/(?:comic|title)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid Comix URL format');
    }

    const hashId = urlMatch[1].split('-')[0];

    try {
      const mangaResponse = await fetch(`${this.apiBase}/manga/${hashId}`);
      if (!mangaResponse.ok) {
        throw new Error(`HTTP ${mangaResponse.status}: ${mangaResponse.statusText}`);
      }

      const mangaData = await mangaResponse.json();
      const slug = mangaData.result?.slug || '';

      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const response = await fetch(
          `${this.apiBase}/manga/${hashId}/chapters?sort=desc&limit=100&page=${currentPage}&lang=`,
          { headers: { "User-Agent": this.config.userAgent, Accept: "application/json" } }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.result?.items && Array.isArray(data.result.items)) {
          for (const chapter of data.result.items) {
            const groupName = chapter.scanlation_group?.name || 'Unknown';
            const groupSlug = chapter.scanlation_group?.slug;
            const groupId = chapter.scanlation_group?.scanlation_group_id?.toString();

            const chapterUrl = `${this.baseUrl}/title/${hashId}-${slug}/${chapter.chapter_id}-chapter-${chapter.number}`;

            chapters.push({
              id: `${chapter.chapter_id}`,
              number: chapter.number,
              title: chapter.name || `Chapter ${chapter.number}`,
              url: chapterUrl,
              group: {
                id: groupId || groupSlug || 'unknown',
                name: groupName,
                url: groupSlug ? `${this.baseUrl}/groups/${groupSlug}` : undefined
              }
            });
          }

          const pagination = data.result.pagination;
          if (pagination && currentPage < pagination.last_page) {
            currentPage++;
            await this.delay(500);
          } else {
            hasMorePages = false;
          }
        } else {
          hasMorePages = false;
        }
      }

      console.log(`[Comix] Found ${chapters.length} chapters for ${hashId}`);
    } catch (error) {
      console.error('[Comix] Error fetching chapters:', error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/\/comic\/[^/]+\/(\d+)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    // Comix migrated its API to /api/v1; search is the manga list filtered by keyword.
    const searchUrl = `${this.apiBase}/manga?keyword=${encodeURIComponent(query)}&limit=5&content_rating=suggestive`;
    const results: SearchResult[] = [];

    try {
      const response = await fetch(searchUrl, {
        headers: { "User-Agent": this.config.userAgent, Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.result?.items && Array.isArray(data.result.items)) {
        const seenIds = new Set<string>();
        for (const manga of data.result.items) {
          if (results.length >= 5) break;
          if (!manga.hid || seenIds.has(manga.hid)) continue;
          seenIds.add(manga.hid);

          const coverImage =
            manga.poster?.large || manga.poster?.medium || undefined;

          const url = manga.url
            ? (manga.url.startsWith("http") ? manga.url : `${this.baseUrl}${manga.url}`)
            : `${this.baseUrl}/title/${manga.hid}`;

          results.push({
            id: manga.hid,
            title: manga.title,
            url,
            coverImage,
            latestChapter: manga.latestChapter || 0,
            lastUpdated: manga.chapterUpdatedAtFormatted || "",
            rating: manga.ratedAvg,
            followers: manga.followsTotal?.toString(),
          });
        }
      }

      console.log(`[Comix] Found ${results.length} results for query: ${query}`);
    } catch (error) {
      console.error('[Comix] Search error:', error);
      throw error;
    }

    return results;
  }
}
