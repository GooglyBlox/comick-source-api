/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from '@/types';

export class RavenScansScraper extends BaseScraper {
  private readonly baseUrl = 'https://ravenscans.org';

  getName(): string {
    return 'Raven Scans';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getType(): SourceType {
    return 'aggregator';
  }

  canHandle(url: string): boolean {
    return url.includes('ravenscans.org');
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const match = url.match(/\/manga\/([^/]+)/);
    if (!match) {
      throw new Error('Invalid Raven Scans manga URL');
    }

    const slug = match[1];

    try {
      const html = await this.fetchWithRetry(url);
      const $ = cheerio.load(html);

      const title =
        $('h1.entry-title').text().trim() ||
        $('.series-title').text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        slug.replace(/-/g, ' ');

      return { title, id: slug };
    } catch {
      return {
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        id: slug
      };
    }
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    $('#chapterlist li').each((_, element) => {
      const $li = $(element);
      const dataNum = $li.attr('data-num');
      const $link = $li.find('a');
      const href = $link.attr('href');

      if (href && dataNum) {
        const chapterNumber = parseInt(dataNum, 10);

        if (!seenChapterNumbers.has(chapterNumber)) {
          seenChapterNumbers.add(chapterNumber);
          chapters.push({
            id: `${chapterNumber}`,
            number: chapterNumber,
            title: `Chapter ${chapterNumber}`,
            url: href
          });
        }
      }
    });

    console.log(`[Raven Scans] Found ${chapters.length} chapters`);

    return chapters.sort((a, b) => a.number - b.number);
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const match = html.match(/ts_reader\.run\((\{.*?\})\)/s);
    if (!match) return [];

    try {
      const data = JSON.parse(match[1]);
      const images: string[] = data.sources?.[0]?.images || [];
      return images.map((url, index) => ({ url, page: index + 1 }));
    } catch {
      return [];
    }
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/chapter[/-](\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return 0;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $('.listupd .bs').each((_, element) => {
      const $item = $(element);
      const $link = $item.find('a');
      const url = $link.attr('href');
      const title = $link.attr('title') || $item.find('.tt').text().trim();
      const coverImage = $item.find('img').attr('src');
      const ratingText = $item.find('.numscore').text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      const chapterText = $item.find('.epxs').text().trim();
      const chapterMatch = chapterText.match(/Chapter (\d+)/);
      const latestChapter = chapterMatch ? parseInt(chapterMatch[1], 10) : 0;

      if (url && title) {
        const slugMatch = url.match(/\/manga\/([^/]+)/);
        const id = slugMatch ? slugMatch[1] : url;

        results.push({
          id,
          title,
          url,
          coverImage,
          latestChapter,
          lastUpdated: '',
          rating
        });
      }
    });

    // Handle the chapter 0 issue: if latestChapter is 0, fetch the actual chapter list
    for (const result of results) {
      if (result.latestChapter === 0) {
        try {
          const chapters = await this.getChapterList(result.url);
          if (chapters.length > 0) {
            result.latestChapter = Math.max(...chapters.map(ch => ch.number));
          }
        } catch (error) {
          console.error(`[Raven Scans] Failed to fetch chapter list for ${result.url}:`, error);
        }
      }
    }

    console.log(`[Raven Scans] Found ${results.length} results for query: ${query}`);

    return results;
  }
}
