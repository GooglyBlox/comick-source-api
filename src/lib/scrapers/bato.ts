/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from 'cheerio';
import { BaseScraper } from './base';
import { ChapterImage, ScrapedChapter, SearchResult } from '@/types';

export class BatoScraper extends BaseScraper {
  private readonly BASE_URL = "https://bato.to";

  getName(): string {
    return 'Bato';
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes('bato.to');
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const results: SearchResult[] = [];
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const searchUrl = `${this.BASE_URL}/search?word=${encodeURIComponent(query)}&page=${currentPage}`;
        const html = await this.fetchWithRetry(searchUrl);
        const $ = cheerio.load(html);

        const items = $('#series-list .col.item').toArray();

        if (items.length === 0) {
          hasMorePages = false;
          break;
        }

        for (const item of items) {
          const $item = $(item);

          // Filter out items with language flag (non-English or wrong language)
          // Items with .no-flag class are what we want
          const hasFlag = $item.find('.item-flag').length > 0;
          if (hasFlag) {
            continue;
          }

          const $volch = $item.find('.item-volch');
          if ($volch.length === 0) {
            continue;
          }

          const $titleLink = $item.find('.item-title');
          const title = $titleLink.text().trim();
          const href = $titleLink.attr('href');

          if (!title || !href) {
            continue;
          }

          const urlMatch = href.match(/\/series\/(\d+)\//);
          const id = urlMatch ? urlMatch[1] : '';

          if (!id) {
            continue;
          }

          const fullUrl = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;

          const $coverImg = $item.find('.item-cover img');
          const coverImage = $coverImg.attr('src');

          const $latestChapter = $volch.find('a').first();
          const latestChapterText = $latestChapter.text().trim();

          let latestChapter = 0;
          const chapterMatch = latestChapterText.match(/(?:Chapter|Ch\.?)\s*(\d+(?:\.\d+)?)/i);
          if (chapterMatch) {
            latestChapter = parseFloat(chapterMatch[1]);
          }

          const lastUpdated = $volch.find('i').first().text().trim() || '';

          results.push({
            id,
            title,
            url: fullUrl,
            coverImage: coverImage || undefined,
            latestChapter,
            lastUpdated,
          });
        }

        const $nextPageLink = $('.pagination .page-item:not(.disabled):not(.active) a').filter((_: number, el: any) => {
          const text = $(el).text().trim();
          return text === '»' || text === 'Next';
        });

        if ($nextPageLink.length === 0) {
          hasMorePages = false;
        } else {
          const $pageLinks = $('.pagination .page-item a[href*="page="]');
          let maxPage = currentPage;
          $pageLinks.each((_: number, el: any) => {
            const href = $(el).attr('href');
            const pageMatch = href?.match(/page=(\d+)/);
            if (pageMatch) {
              const pageNum = parseInt(pageMatch[1]);
              if (pageNum > maxPage) {
                maxPage = pageNum;
              }
            }
          });

          if (currentPage >= maxPage) {
            hasMorePages = false;
          } else {
            currentPage++;
            await this.delay(500);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Bato search error:', error);
      throw error;
    }
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    let title = $('h3.item-title').first().text().trim();
    if (!title) {
      title = $('title').text().split(' - ')[0].trim();
    }

    const urlMatch = url.match(/\/series\/(\d+)\//);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const html = await this.fetchWithRetry(mangaUrl);
    const $ = cheerio.load(html);
    const chapters: ScrapedChapter[] = [];
    const seenChapterNumbers = new Set<number>();

    // Find all chapter items - look for items with chapter links
    // Structure: <div class="item"> <a href="/chapter/xxx" class="chapt"><b>Chapter XXX</b></a> </div>
    $('a.chapt[href*="/chapter/"]').each((_: number, element: any) => {
      const $chapterLink = $(element);
      const href = $chapterLink.attr('href');

      if (!href) {
        return;
      }

      const linkText = $chapterLink.text().trim();
      let chapterNumber = -1;

      const chapterMatch = linkText.match(/(?:Chapter|Ch\.?)\s*(\d+(?:\.\d+)?)/i);
      if (chapterMatch) {
        chapterNumber = parseFloat(chapterMatch[1]);
      }

      if (chapterNumber < 0) {
        const urlMatch = href.match(/\/chapter\/(\d+)/);
        if (urlMatch) {
          // Note: This is the chapter ID, not necessarily the chapter number
          // But it's better than nothing
          chapterNumber = parseFloat(urlMatch[1]);
        }
      }

      if (chapterNumber < 0 || seenChapterNumbers.has(chapterNumber)) {
        return;
      }

      seenChapterNumbers.add(chapterNumber);

      const chapterTitle = linkText || `Chapter ${chapterNumber}`;

      const fullUrl = href.startsWith('http') ? href : `${this.BASE_URL}${href}`;

      chapters.push({
        id: `${chapterNumber}`,
        number: chapterNumber,
        title: chapterTitle,
        url: fullUrl,
      });
    });

    return chapters.sort((a, b) => a.number - b.number);
  }

  protected extractChapterNumber(chapterUrl: string): number {
    const match = chapterUrl.match(/\/chapter\/(\d+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  override supportsChapterImages(): boolean {
    return true;
  }

  async getChapterImages(chapterUrl: string): Promise<ChapterImage[]> {
    const html = await this.fetchWithRetry(chapterUrl);
    const images: ChapterImage[] = [];

    // Try to find image URLs in JavaScript variables
    const scriptMatch = html.match(/const\s+imgHttps\s*=\s*(\[[\s\S]*?\]);/) ||
                        html.match(/const\s+images\s*=\s*(\[[\s\S]*?\]);/) ||
                        html.match(/var\s+imgHttps\s*=\s*(\[[\s\S]*?\]);/) ||
                        html.match(/var\s+images\s*=\s*(\[[\s\S]*?\]);/);

    if (scriptMatch) {
      try {
        const imgUrls: string[] = JSON.parse(scriptMatch[1]);
        for (const url of imgUrls) {
          if (url && url.startsWith("http")) {
            images.push({ url, page: images.length + 1 });
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    if (images.length > 0) return images;

    // Fallback: parse img tags from the reader
    const $ = cheerio.load(html);
    $(".page-img img, .reader-img img, #viewer img, .chapter-img img").each((_, el) => {
      const url = $(el).attr("data-src")?.trim() || $(el).attr("src")?.trim();
      if (url && url.startsWith("http") && !url.includes("logo") && !url.includes("icon")) {
        images.push({ url, page: images.length + 1 });
      }
    });

    if (images.length === 0) {
      // Last resort: find all images that look like chapter pages
      $("img[src*='comic'], img[src*='chapter'], img[src*='manga']").each((_, el) => {
        const url = $(el).attr("src")?.trim();
        if (url && url.startsWith("http")) {
          images.push({ url, page: images.length + 1 });
        }
      });
    }

    return images;
  }
}
