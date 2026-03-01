/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult, SourceType } from '@/types';

export class RizzFablesScraper extends BaseScraper {
  getName(): string {
    return 'Rizz Fables';
  }

  getBaseUrl(): string {
    return 'https://rizzfables.com';
  }

  getType(): SourceType {
    return 'scanlator';
  }

  canHandle(url: string): boolean {
    return url.includes('rizzfables.com');
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title = $('.post-title h1').first().text().trim() ||
                  $('h1').first().text().trim() ||
                  $('title').text().split(' - ')[0].trim();

    const urlMatch = url.match(/\/series\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      $('.eplister ul li').each((_: number, element: any) => {
        const $chapter = $(element);
        const $link = $chapter.find('.eph-num a').first();
        const href = $link.attr('href');
        const chapterText = $link.find('.chapternum').text().trim();

        if (href) {
          const fullUrl = href.startsWith('http') ? href : `https://rizzfables.com${href}`;
          const chapterNumber = this.extractChapterNumber(fullUrl);

          if (chapterNumber >= 0 && !seenChapterNumbers.has(chapterNumber)) {
            seenChapterNumbers.add(chapterNumber);
            chapters.push({
              id: `${chapterNumber}`,
              number: chapterNumber,
              title: chapterText,
              url: fullUrl,
            });
          } else {
            console.log(`[RizzFables] Skipped chapter - number: ${chapterNumber}, href: ${href}, text: ${chapterText}`);
          }
        } else {
          console.log(`[RizzFables] Chapter element has no href`);
        }
      });
    } catch (error) {
      console.error('[RizzFables] Chapter fetch error:', error);
    }

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
    const patterns = [
      /-chapter[/-](\d+)(?:[.-](\d+))?/i,
      /chapter[/-](\d+)(?:[.-](\d+))?$/i
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        const mainNumber = parseInt(match[1], 10);
        const decimalPart = match[2] ? parseInt(match[2], 10) : 0;

        if (decimalPart > 0) {
          return mainNumber + (decimalPart / 10);
        }
        return mainNumber;
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const seriesListUrl = `https://rizzfables.com/series`;
    const html = await this.fetchWithRetry(seriesListUrl);
    const $ = cheerio.load(html);
    const matchedSeries: Array<{
      id: string;
      title: string;
      url: string;
      coverImage?: string;
      rating?: number;
    }> = [];

    $('.bs').each((_, element) => {
      const $item = $(element);

      const link = $item.find('.bsx a').first();
      const url = link.attr('href');
      const title = link.attr('title') || $item.find('.tt').text().trim();

      if (!url) return;

      const lowerQuery = query.toLowerCase();
      const lowerTitle = title.toLowerCase();
      if (!lowerTitle.includes(lowerQuery)) {
        return;
      }

      const slugMatch = url.match(/\/series\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : '';

      const coverImg = $item.find('.bsx img').first();
      const coverImage = coverImg.attr('data-src') || coverImg.attr('src');

      const ratingDiv = $item.find('.numscore').first();
      const ratingText = ratingDiv.text().trim();
      const rating = ratingText ? parseFloat(ratingText) : undefined;

      matchedSeries.push({
        id,
        title,
        url,
        coverImage: coverImage?.startsWith('http') ? coverImage : coverImage ? `https://rizzfables.com${coverImage}` : undefined,
        rating,
      });
    });

    const results: SearchResult[] = [];
    for (const series of matchedSeries) {
      try {
        const seriesHtml = await this.fetchWithRetry(series.url);
        const $series = cheerio.load(seriesHtml);

        const firstChapter = $series('.eplister ul li').first();
        const latestChapterText = firstChapter.find('.chapternum').text().trim();
        const lastUpdatedText = firstChapter.find('.chapterdate').text().trim();

        const chapterMatch = latestChapterText.match(/Chapter\s+([\d.]+)/i);
        const latestChapter = chapterMatch ? parseFloat(chapterMatch[1]) : 0;

        let lastUpdatedTimestamp: number | undefined;
        if (lastUpdatedText) {
          try {
            const parsedDate = new Date(lastUpdatedText);
            if (!isNaN(parsedDate.getTime())) {
              lastUpdatedTimestamp = parsedDate.getTime();
            }
          } catch {
            console.log(`[RizzFables] Failed to parse date: ${lastUpdatedText}`);
          }
        }

        results.push({
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter,
          lastUpdated: lastUpdatedText,
          lastUpdatedTimestamp,
          rating: series.rating,
        });
      } catch (error) {
        console.error(`[RizzFables] Failed to fetch chapter list for ${series.title}:`, error);
        results.push({
          id: series.id,
          title: series.title,
          url: series.url,
          coverImage: series.coverImage,
          latestChapter: 0,
          lastUpdated: '',
          rating: series.rating,
        });
      }
    }

    return results;
  }
}
