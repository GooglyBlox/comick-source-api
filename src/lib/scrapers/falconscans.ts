/* eslint-disable @typescript-eslint/no-explicit-any */
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from '@/types';

export class FalconscansScraper extends BaseScraper {
  private readonly baseUrl = 'https://falconscans.com';
  private readonly apiBase = 'https://falconscans.com/api/backend/api';

  getName(): string {
    return 'Falcon Scans';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getType(): SourceType {
    return 'scanlator';
  }

  canHandle(url: string): boolean {
    return url.includes('falconscans.com');
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const urlMatch = url.match(/\/(?:manga|comics)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid FalconScans URL format');
    }

    const slug = urlMatch[1];

    try {
      const response = await fetch(`${this.apiBase}/manga/${slug}?chapterPage=1&chapterLimit=1`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        title: data.title,
        id: slug
      };
    } catch (error) {
      console.error('[FalconScans] Error extracting manga info:', error);
      return {
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        id: slug
      };
    }
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    const urlMatch = mangaUrl.match(/\/(?:manga|comics)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid FalconScans URL format');
    }

    const slug = urlMatch[1];

    try {
      const response = await fetch(`${this.apiBase}/manga/${slug}?chapterPage=1&chapterLimit=1000`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.chapters && Array.isArray(data.chapters)) {
        for (const chapter of data.chapters) {
          chapters.push({
            id: `${chapter.number}`,
            number: chapter.number,
            title: chapter.title || `Chapter ${chapter.number}`,
            url: `${this.baseUrl}/manga/${slug}/chapter/${chapter.number}`
          });
        }
      }

      console.log(`[FalconScans] Found ${chapters.length} chapters for ${slug}`);
    } catch (error) {
      console.error('[FalconScans] Error fetching chapters:', error);
      throw error;
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/manga\/[^/]+\/chapter\/(\d+(?:\.\d+)?)/,
      /\/comics\/[^/]+\/(\d+(?:\.\d+)?)/
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.apiBase}/manga/public?sortBy=createdAt&sortOrder=desc&page=1&limit=20&q=${encodeURIComponent(query)}`;
    const results: SearchResult[] = [];

    try {
      const response = await fetch(searchUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        for (const manga of data.data) {
          let latestChapter = 0;
          let lastUpdatedTimestamp: number | undefined;
          let lastUpdated = '';

          try {
            const chaptersResponse = await fetch(`${this.apiBase}/manga/${manga.slug}?chapterPage=1&chapterLimit=1`);
            if (chaptersResponse.ok) {
              const chaptersData = await chaptersResponse.json();
              if (chaptersData.chapters && Array.isArray(chaptersData.chapters) && chaptersData.chapters.length > 0) {
                latestChapter = Math.max(...chaptersData.chapters.map((ch: any) => ch.number));

                const sortedChapters = [...chaptersData.chapters].sort((a: any, b: any) => {
                  const dateA = new Date(a.createdAt).getTime();
                  const dateB = new Date(b.createdAt).getTime();
                  return dateB - dateA;
                });

                if (sortedChapters.length > 0) {
                  lastUpdatedTimestamp = new Date(sortedChapters[0].createdAt).getTime();
                  lastUpdated = new Date(sortedChapters[0].createdAt).toLocaleDateString();
                }
              }
            }
          } catch {
            console.warn(`[FalconScans] Failed to fetch chapters for ${manga.slug}, using fallback`);
            latestChapter = manga._count?.chapters || 0;
            lastUpdatedTimestamp = manga.updatedAt ? new Date(manga.updatedAt).getTime() : undefined;
            lastUpdated = manga.updatedAt ? new Date(manga.updatedAt).toLocaleDateString() : '';
          }

          let coverImage: string | undefined;
          if (manga.cover) {
            coverImage = manga.cover.startsWith('http')
              ? manga.cover
              : `${this.baseUrl}${manga.cover}`;
          }

          results.push({
            id: manga.slug,
            title: manga.title,
            url: `${this.baseUrl}/manga/${manga.slug}`,
            coverImage,
            latestChapter,
            lastUpdated,
            lastUpdatedTimestamp
          });
        }
      }

      console.log(`[FalconScans] Found ${results.length} results for query: ${query}`);
    } catch (error) {
      console.error('[FalconScans] Search error:', error);
      throw error;
    }

    return results;
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const match = chapterUrl.match(/\/manga\/([^/]+)\/chapter\/(\d+(?:\.\d+)?)/);
    if (!match) return [];

    const slug = match[1];
    const chapterNumber = match[2];

    try {
      const response = await fetch(`${this.apiBase}/manga/${slug}?chapterPage=1&chapterLimit=1000`, {
        headers: { 'User-Agent': this.config.userAgent },
      });

      if (!response.ok) return [];
      const data = await response.json();

      // Find the chapter in the list
      const chapter = data.chapters?.find((ch: any) => String(ch.number) === chapterNumber);
      if (chapter?.images && Array.isArray(chapter.images)) {
        return chapter.images.map((img: any, index: number) => ({
          url: typeof img === 'string' ? img : img.url,
          page: index + 1,
        }));
      }

      // Try fetching chapter directly
      if (chapter?.id) {
        const chapterResponse = await fetch(`${this.apiBase}/chapters/${chapter.id}`, {
          headers: { 'User-Agent': this.config.userAgent },
        });
        if (chapterResponse.ok) {
          const chapterData = await chapterResponse.json();
          const images = chapterData.images || chapterData.chapter?.images || [];
          return images.map((img: any, index: number) => ({
            url: typeof img === 'string' ? img : img.url,
            page: index + 1,
          }));
        }
      }
    } catch {
      // Fallback to HTML parsing
    }

    // Fallback: fetch the chapter page and parse images
    const html = await this.fetchWithRetry(chapterUrl);
    const images: ChapterImage[] = [];
    const imgPattern = /"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi;
    let imgMatch;
    const seenUrls = new Set<string>();
    while ((imgMatch = imgPattern.exec(html)) !== null) {
      const url = imgMatch[1];
      if (!seenUrls.has(url) && !url.includes("logo") && !url.includes("icon") && !url.includes("avatar")) {
        seenUrls.add(url);
        images.push({ url, page: images.length + 1 });
      }
    }

    return images;
  }
}
