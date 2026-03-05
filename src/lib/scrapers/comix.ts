/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from '@/types';

export class ComixScraper extends BaseScraper {
  private readonly baseUrl = 'https://comix.to';
  private readonly apiBase = 'https://comix.to/api/v2';

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
          `${this.apiBase}/manga/${hashId}/chapters?order[number]=desc&limit=100&page=${currentPage}`
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

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const match = chapterUrl.match(/\/(\d+)-chapter-/) || chapterUrl.match(/\/title\/[^/]+\/([^-]+)/);
    if (!match) return [];

    const chapterId = match[1];
    const response = await fetch(`${this.apiBase}/chapters/${chapterId}`, {
      headers: { 'User-Agent': this.config.userAgent },
    });

    if (!response.ok) return [];
    const data = await response.json();
    const images: { url: string }[] = data.images || data.chapter?.images || [];

    return images.map((img, index) => ({ url: img.url, page: index + 1 }));
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.apiBase}/manga?order[relevance]=desc&keyword=${encodeURIComponent(query)}&limit=5`;
    const results: SearchResult[] = [];

    try {
      const response = await fetch(searchUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.result?.items && Array.isArray(data.result.items)) {
        for (const manga of data.result.items) {
          let coverImage: string | undefined;
          if (manga.poster?.large) {
            coverImage = manga.poster.large;
          } else if (manga.poster?.medium) {
            coverImage = manga.poster.medium;
          }

          let lastUpdated = '';
          let lastUpdatedTimestamp: number | undefined;
          if (manga.chapter_updated_at) {
            lastUpdatedTimestamp = manga.chapter_updated_at * 1000;
            lastUpdated = new Date(lastUpdatedTimestamp).toLocaleDateString();
          }

          results.push({
            id: manga.hash_id,
            title: manga.title,
            url: `${this.baseUrl}/title/${manga.hash_id}-${manga.slug}`,
            coverImage,
            latestChapter: manga.latest_chapter || 0,
            lastUpdated,
            lastUpdatedTimestamp,
            rating: manga.rated_avg,
            followers: manga.follows_total?.toString()
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
