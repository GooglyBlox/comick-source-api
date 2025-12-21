import * as cheerio from "cheerio";
import { BaseScraper } from "./base";
import { ScrapedChapter, SearchResult, SourceType } from "@/types";

export class MangataroScraper extends BaseScraper {
  private readonly BASE_URL = "https://mangataro.org";

  getName(): string {
    return "Mangataro";
  }

  getBaseUrl(): string {
    return this.BASE_URL;
  }

  canHandle(url: string): boolean {
    return url.includes("mangataro.org");
  }

  getType(): SourceType {
    return "aggregator";
  }

  async extractMangaInfo(url: string): Promise<{ title: string; id: string }> {
    const html = await this.fetchWithRetry(url);
    const $ = cheerio.load(html);

    const title =
      $("h1").first().text().trim() ||
      $("title").text().split(" - ")[0].trim();

    const urlMatch = url.match(/\/manga\/([^/]+)/);
    const id = urlMatch ? urlMatch[1] : Date.now().toString();

    return { title, id };
  }

  async getChapterList(mangaUrl: string): Promise<ScrapedChapter[]> {
    const chapters: ScrapedChapter[] = [];

    try {
      const html = await this.fetchWithRetry(mangaUrl);
      const $ = cheerio.load(html);

      const mangaId = $(".chapter-list").attr("data-manga-id");

      if (!mangaId) {
        return chapters;
      }

      const { token, timestamp } = this.generateApiToken();

      const apiUrl = `${this.BASE_URL}/auth/manga-chapters?manga_id=${mangaId}&offset=0&limit=500&order=DESC&_t=${token}&_ts=${timestamp}`;

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": this.config.userAgent,
          Referer: mangaUrl,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return chapters;
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.chapters)) {
        for (const chapter of data.chapters) {
          const chapterNumber = parseFloat(chapter.chapter);
          const title =
            chapter.title && chapter.title !== "N/A"
              ? chapter.title
              : `Ch. ${chapter.chapter}`;

          chapters.push({
            id: chapter.id,
            number: chapterNumber,
            title: title,
            url: chapter.url,
          });
        }
      }
    } catch (error) {
      console.error("[Mangataro] Chapter fetch error:", error);
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  private md5(str: string): string {
    const rotateLeft = (value: number, shift: number): number => {
      return (value << shift) | (value >>> (32 - shift));
    };

    const addUnsigned = (x: number, y: number): number => {
      const lsw = (x & 0xffff) + (y & 0xffff);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xffff);
    };

    const md5F = (x: number, y: number, z: number): number =>
      (x & y) | (~x & z);
    const md5G = (x: number, y: number, z: number): number =>
      (x & z) | (y & ~z);
    const md5H = (x: number, y: number, z: number): number => x ^ y ^ z;
    const md5I = (x: number, y: number, z: number): number => y ^ (x | ~z);

    const md5FF = (
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      ac: number,
    ): number => {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };

    const md5GG = (
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      ac: number,
    ): number => {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };

    const md5HH = (
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      ac: number,
    ): number => {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };

    const md5II = (
      a: number,
      b: number,
      c: number,
      d: number,
      x: number,
      s: number,
      ac: number,
    ): number => {
      a = addUnsigned(a, addUnsigned(addUnsigned(md5I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    };

    const convertToWordArray = (str: string): number[] => {
      const wordArray: number[] = [];
      for (let i = 0; i < str.length * 8; i += 8) {
        wordArray[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << i % 32;
      }
      return wordArray;
    };

    const wordToHex = (value: number): string => {
      let str = "";
      for (let i = 0; i <= 3; i++) {
        const byte = (value >>> (i * 8)) & 0xff;
        str += ("0" + byte.toString(16)).slice(-2);
      }
      return str;
    };

    const x = convertToWordArray(str);
    const len = str.length * 8;
    x[len >> 5] |= 0x80 << len % 32;
    x[((len + 64) >>> 9 << 4) + 14] = len;

    let a = 0x67452301;
    let b = 0xefcdab89;
    let c = 0x98badcfe;
    let d = 0x10325476;

    for (let k = 0; k < x.length; k += 16) {
      const AA = a,
        BB = b,
        CC = c,
        DD = d;

      a = md5FF(a, b, c, d, x[k + 0], 7, 0xd76aa478);
      d = md5FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
      c = md5FF(c, d, a, b, x[k + 2], 17, 0x242070db);
      b = md5FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
      a = md5FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf);
      d = md5FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
      c = md5FF(c, d, a, b, x[k + 6], 17, 0xa8304613);
      b = md5FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
      a = md5FF(a, b, c, d, x[k + 8], 7, 0x698098d8);
      d = md5FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
      c = md5FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1);
      b = md5FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
      a = md5FF(a, b, c, d, x[k + 12], 7, 0x6b901122);
      d = md5FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
      c = md5FF(c, d, a, b, x[k + 14], 17, 0xa679438e);
      b = md5FF(b, c, d, a, x[k + 15], 22, 0x49b40821);

      a = md5GG(a, b, c, d, x[k + 1], 5, 0xf61e2562);
      d = md5GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
      c = md5GG(c, d, a, b, x[k + 11], 14, 0x265e5a51);
      b = md5GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
      a = md5GG(a, b, c, d, x[k + 5], 5, 0xd62f105d);
      d = md5GG(d, a, b, c, x[k + 10], 9, 0x2441453);
      c = md5GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681);
      b = md5GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
      a = md5GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6);
      d = md5GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
      c = md5GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87);
      b = md5GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
      a = md5GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905);
      d = md5GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
      c = md5GG(c, d, a, b, x[k + 7], 14, 0x676f02d9);
      b = md5GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);

      a = md5HH(a, b, c, d, x[k + 5], 4, 0xfffa3942);
      d = md5HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
      c = md5HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122);
      b = md5HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
      a = md5HH(a, b, c, d, x[k + 1], 4, 0xa4beea44);
      d = md5HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
      c = md5HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60);
      b = md5HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
      a = md5HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6);
      d = md5HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
      c = md5HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085);
      b = md5HH(b, c, d, a, x[k + 6], 23, 0x4881d05);
      a = md5HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039);
      d = md5HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
      c = md5HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8);
      b = md5HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);

      a = md5II(a, b, c, d, x[k + 0], 6, 0xf4292244);
      d = md5II(d, a, b, c, x[k + 7], 10, 0x432aff97);
      c = md5II(c, d, a, b, x[k + 14], 15, 0xab9423a7);
      b = md5II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
      a = md5II(a, b, c, d, x[k + 12], 6, 0x655b59c3);
      d = md5II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
      c = md5II(c, d, a, b, x[k + 10], 15, 0xffeff47d);
      b = md5II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
      a = md5II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f);
      d = md5II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
      c = md5II(c, d, a, b, x[k + 6], 15, 0xa3014314);
      b = md5II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
      a = md5II(a, b, c, d, x[k + 4], 6, 0xf7537e82);
      d = md5II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
      c = md5II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb);
      b = md5II(b, c, d, a, x[k + 9], 21, 0xeb86d391);

      a = addUnsigned(a, AA);
      b = addUnsigned(b, BB);
      c = addUnsigned(c, CC);
      d = addUnsigned(d, DD);
    }

    return (
      wordToHex(a) +
      wordToHex(b) +
      wordToHex(c) +
      wordToHex(d)
    ).toLowerCase();
  }

  private generateApiToken(): { token: string; timestamp: number } {
    const timestamp = Math.floor(Date.now() / 1000);

    const now = new Date();
    const hour = now.toISOString().slice(0, 13).replace(/[-T:]/g, "");

    const secret = `mng_ch_${hour}`;

    const hash = this.md5(`${timestamp}${secret}`).substring(0, 16);

    return {
      token: hash,
      timestamp: timestamp,
    };
  }

  protected override extractChapterNumber(chapterUrl: string): number {
    const patterns = [
      /\/ch(\d+(?:\.\d+)?)-\d+/i,
      /chapter[/-](\d+(?:\.\d+)?)/i,
    ];

    for (const pattern of patterns) {
      const match = chapterUrl.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return -1;
  }

  async search(query: string): Promise<SearchResult[]> {
    const searchUrl = `${this.BASE_URL}/?s=${encodeURIComponent(query)}`;
    const html = await this.fetchWithRetry(searchUrl);
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $(".grid > div.group.relative").each((_, element) => {
      const $item = $(element);

      const titleLink = $item.find('a[href*="/manga/"]').first();
      const url = titleLink.attr("href");
      const title = $item.find("h3").text().trim();

      if (!url || !title) return;

      const slugMatch = url.match(/\/manga\/([^/]+)/);
      const id = slugMatch ? slugMatch[1] : "";

      const coverImg = $item.find("img").first();
      const coverImage = coverImg.attr("src");

      results.push({
        id,
        title,
        url: url.startsWith("http") ? url : `${this.BASE_URL}${url}`,
        coverImage: coverImage?.startsWith("http")
          ? coverImage
          : coverImage
            ? `${this.BASE_URL}${coverImage}`
            : undefined,
        latestChapter: 0,
        lastUpdated: "",
      });
    });

    const resultsWithChapterInfo = await Promise.all(
      results.map(async (result) => {
        try {
          const html = await this.fetchWithRetry(result.url);
          const $ = cheerio.load(html);

          const mangaId = $(".chapter-list").attr("data-manga-id");

          if (!mangaId) {
            return result;
          }

          const { token, timestamp } = this.generateApiToken();

          const apiUrl = `${this.BASE_URL}/auth/manga-chapters?manga_id=${mangaId}&offset=0&limit=1&order=DESC&_t=${token}&_ts=${timestamp}`;

          const response = await fetch(apiUrl, {
            headers: {
              "User-Agent": this.config.userAgent,
              Referer: result.url,
              Accept: "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();

            if (
              data.success &&
              Array.isArray(data.chapters) &&
              data.chapters.length > 0
            ) {
              const latestChapter = parseFloat(data.chapters[0].chapter);
              const lastUpdated = data.chapters[0].date;

              return {
                ...result,
                latestChapter,
                lastUpdated,
              };
            }
          }

          return result;
        } catch (error) {
          console.error(
            `[Mangataro] Error fetching chapter info for ${result.title}:`,
            error,
          );
          return result;
        }
      }),
    );

    return resultsWithChapterInfo.slice(0, 5);
  }
}
