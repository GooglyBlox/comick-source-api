/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from '@/types';

export class WeebdexScraper extends BaseScraper {
  private readonly baseUrl = 'https://weebdex.org';
  private readonly apiBase = 'https://api.weebdex.org';
  private readonly coverBase = 'https://srv.notdelta.xyz/covers';

  getName(): string {
    return 'Weebdex';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getType(): SourceType {
    return 'aggregator';
  }

  canHandle(url: string): boolean {
    return url.includes('weebdex.org');
  }

  private async fetchApi(url: string, retries = 3): Promise<any> {
    for (let i = 0; i <= retries; i++) {
      const response = await fetch(url);

      if (response.status === 429) {
        const waitTime = Math.min(2000 * Math.pow(2, i), 10000);
        await this.delay(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    }

    throw new Error('Rate limited: Too many requests');
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/title\/([a-z0-9]+)/i);
    if (!urlMatch) {
      throw new Error('Invalid Weebdex URL format');
    }

    const mangaId = urlMatch[1];

    try {
      const data = await this.fetchApi(`${this.apiBase}/manga/${mangaId}`);

      return {
        title: data.title || mangaId,
        id: mangaId
      };
    } catch {
      return {
        title: mangaId,
        id: mangaId
      };
    }
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    const urlMatch = mangaUrl.match(/\/title\/([a-z0-9]+)/i);
    if (!urlMatch) {
      throw new Error('Invalid Weebdex URL format');
    }

    const mangaId = urlMatch[1];

    const mangaData = await this.fetchApi(`${this.apiBase}/manga/${mangaId}`);
    const availableGroups = mangaData.relationships?.available_groups || [];
    const groupMap = new Map<string, { id: string; name: string }>();
    for (const group of availableGroups) {
      groupMap.set(group.id, { id: group.id, name: group.name });
    }

    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const data = await this.fetchApi(
        `${this.apiBase}/manga/${mangaId}/chapters?limit=100&page=${currentPage}`
      );

      if (data.data && Array.isArray(data.data)) {
        for (const chapter of data.data) {
          if (chapter.language !== 'en') continue;

          const chapterNumber = parseFloat(chapter.chapter) || 0;
          const chapterUrl = `${this.baseUrl}/chapter/${chapter.id}`;

          const groupId = chapter.scanlation_group || chapter.group_id;
          const groupInfo = groupId ? groupMap.get(groupId) : undefined;

          chapters.push({
            id: chapter.id,
            number: chapterNumber,
            title: chapter.title || `Chapter ${chapter.chapter}`,
            url: chapterUrl,
            group: groupInfo ? {
              id: groupInfo.id,
              name: groupInfo.name,
              url: `${this.baseUrl}/group/${groupInfo.id}`
            } : undefined
          });
        }

        const totalPages = Math.ceil(data.total / data.limit);
        if (currentPage < totalPages) {
          currentPage++;
          await this.delay(500);
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const match = chapterUrl.match(/\/chapter\/([^/?]+)/);
    if (!match) return [];

    const chapterId = match[1];
    const data = await this.fetchApi(`${this.apiBase}/chapter/${chapterId}`);
    const node = data.node;
    const files: string[] = data.data_optimized || data.data || [];

    return files.map((filename, index) => ({
      url: `${node}/data/${chapterId}/${filename}`,
      page: index + 1,
    }));
  }

  private async getEnglishChapterCount(mangaId: string): Promise<number> {
    try {
      const data = await this.fetchApi(
        `${this.apiBase}/manga/${mangaId}/chapters?limit=100&page=1`
      );

      if (data.data && Array.isArray(data.data)) {
        let maxChapter = 0;
        for (const chapter of data.data) {
          if (chapter.language === 'en') {
            const chapterNum = parseFloat(chapter.chapter) || 0;
            if (chapterNum > maxChapter) {
              maxChapter = chapterNum;
            }
          }
        }
        return maxChapter;
      }

      return 0;
    } catch {
      return 0;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.apiBase}/manga?title=${encodeURIComponent(query)}&sort=relevance&limit=5`;
    const results: SearchResult[] = [];

    const data = await this.fetchApi(searchUrl);

    if (data.data && Array.isArray(data.data)) {
      for (const manga of data.data) {
        let coverImage: string | undefined;
        if (manga.relationships?.cover?.id) {
          coverImage = `${this.coverBase}/${manga.id}/${manga.relationships.cover.id}.256.webp`;
        }

        let lastUpdated = '';
        let lastUpdatedTimestamp: number | undefined;
        if (manga.updated_at) {
          lastUpdatedTimestamp = new Date(manga.updated_at).getTime();
          lastUpdated = new Date(manga.updated_at).toLocaleDateString();
        }

        await this.delay(300);
        const chapterCount = await this.getEnglishChapterCount(manga.id);

        results.push({
          id: manga.id,
          title: manga.title,
          url: `${this.baseUrl}/title/${manga.id}`,
          coverImage,
          latestChapter: chapterCount,
          lastUpdated,
          lastUpdatedTimestamp,
          rating: undefined,
          followers: manga.relationships?.stats?.follows?.toString()
        });
      }
    }

    return results;
  }
}
