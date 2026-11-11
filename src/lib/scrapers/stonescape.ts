/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from './base';
import { ScrapedChapter, SearchResult, SourceType } from '@/types';

export class StonescapeScraper extends BaseScraper {
  getName(): string {
    return 'Stonescape';
  }

  getBaseUrl(): string {
    return 'https://stonescape.xyz';
  }

  canHandle(url: string): boolean {
    return url.includes('stonescape.xyz');
  }

  getType(): SourceType {
    return 'scanlator';
  }

  private async fetchJson(path: string): Promise<any> {
    const url = `${this.getBaseUrl()}${path}`;
    let lastError: unknown;

    for (let i = 0; i <= this.config.retryAttempts; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': this.config.userAgent,
            Accept: 'application/json',
            Referer: `${this.getBaseUrl()}/`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private getSlug(url: string): string {
    const match = url.match(/\/series\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  private async findSeries(slug: string): Promise<any | null> {
    const words = slug.replace(/-/g, ' ');
    const found = await this.fetchJson(`/api/series?search=${encodeURIComponent(words)}&limit=20`);
    const direct = (found.data || []).find((s: any) => s.slug === slug);
    if (direct) return direct;

    const all = await this.fetchJson('/api/series?limit=100');
    return (all.data || []).find((s: any) => s.slug === slug) || null;
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const slug = this.getSlug(url);
    const series = slug ? await this.findSeries(slug) : null;

    if (series) {
      return { title: series.title, id: series.slug };
    }

    return {
      title: slug.replace(/-/g, ' '),
      id: slug || Date.now().toString(),
    };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const slug = this.getSlug(mangaUrl);

    try {
      const series = await this.findSeries(slug);
      if (!series) {
        throw new Error(`Series not found for slug ${slug}`);
      }

      const data = await this.fetchJson(`/api/series/${series.seriesId}/chapters`);
      const seen = new Set<number>();
      const chapters: ScrapedChapter[] = [];

      for (const chapter of data.chapters || []) {
        if (chapter.accessMode !== 'free' || chapter.status !== 'published') continue;

        const number = parseFloat(chapter.chapterNumber);
        if (!Number.isFinite(number) || number < 0 || seen.has(number)) continue;
        seen.add(number);

        chapters.push({
          id: `${number}`,
          number,
          title: chapter.title || `Chapter ${number}`,
          url: `${this.getBaseUrl()}/series/${series.slug}/ch-${number}`,
          lastUpdated: chapter.publishedAt || chapter.createdAt || undefined,
        });
      }

      return chapters.sort((a, b) => a.number - b.number);
    } catch (error) {
      console.error('[Stonescape] Chapter fetch error:', error);
      throw error;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson(`/api/series?search=${encodeURIComponent(query)}&limit=20`);

    return (data.data || []).map((series: any): SearchResult => {
      const cover: string | undefined = series.coverUrl || undefined;
      const latestChapter = parseFloat(series.latestChapter?.chapterNumber);
      const updated: string | undefined = series.lastChapterUploadedAt || series.updatedAt || undefined;
      const timestamp = updated ? new Date(updated).getTime() : NaN;

      return {
        id: series.slug,
        title: series.title,
        url: `${this.getBaseUrl()}/series/${series.slug}`,
        coverImage: cover ? (cover.startsWith('http') ? cover : `${this.getBaseUrl()}${cover}`) : undefined,
        latestChapter: Number.isFinite(latestChapter) ? latestChapter : 0,
        lastUpdated: updated || '',
        lastUpdatedTimestamp: Number.isFinite(timestamp) ? timestamp : undefined,
      };
    });
  }
}
