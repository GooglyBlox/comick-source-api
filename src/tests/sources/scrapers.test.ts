/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { getAllScrapers } from "@/lib/scrapers";
import { checkSourceHealth, SourceStatus } from "@/lib/utils/source-health";

describe("Source Scrapers", () => {
  const scrapers = getAllScrapers();

  describe("All scrapers basic functionality", () => {
    it("should have at least one scraper", () => {
      expect(scrapers.length).toBeGreaterThan(0);
    });

    it("all scrapers should have required methods", () => {
      scrapers.forEach((scraper) => {
        expect(scraper.getName).toBeDefined();
        expect(scraper.getBaseUrl).toBeDefined();
        expect(scraper.canHandle).toBeDefined();
        expect(scraper.search).toBeDefined();
        expect(scraper.getChapterList).toBeDefined();
        expect(scraper.extractMangaInfo).toBeDefined();
      });
    });

    it("all scrapers should have unique names", () => {
      const names = scrapers.map((s) => s.getName());
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });

  describe("Health Checks", () => {
    scrapers.forEach((scraper) => {
      describe(`${scraper.getName()} health`, () => {
        it("should complete health check", async () => {
          const health = await checkSourceHealth(scraper, "solo leveling");

          expect(health).toBeDefined();
          expect(health.status).toBeDefined();
          expect(health.message).toBeDefined();
          expect(health.lastChecked).toBeDefined();

          console.log(
            `${scraper.getName()}: ${health.status} - ${health.message}`,
          );
        }, 30000);

        it("should return valid status", async () => {
          const health = await checkSourceHealth(scraper, "test");

          expect(Object.values(SourceStatus)).toContain(health.status);
        }, 30000);
      });
    });
  });

  describe("Search functionality", () => {
    const testQueries = [
      { query: "solo leveling", minResults: 0 },
      { query: "one piece", minResults: 0 },
    ];

    scrapers.forEach((scraper) => {
      testQueries.forEach(({ query, minResults }) => {
        it(`${scraper.getName()} - should search for "${query}"`, async () => {
          try {
            const results = await scraper.search(query);

            expect(Array.isArray(results)).toBe(true);

            // If we got results, validate structure
            if (results.length > 0) {
              const firstResult = results[0];
              expect(firstResult).toHaveProperty("id");
              expect(firstResult).toHaveProperty("title");
              expect(firstResult).toHaveProperty("url");
              expect(firstResult).toHaveProperty("latestChapter");

              console.log(
                `${scraper.getName()} search "${query}": ${results.length} results`,
              );
            } else {
              console.log(
                `${scraper.getName()} search "${query}": No results (may be normal or blocked)`,
              );
            }
          } catch (error: any) {
            // Log error but don't fail test - source might be temporarily down
            console.error(`${scraper.getName()} search failed:`, error.message);

            // Check if it's Cloudflare
            if (
              error.message?.includes("cloudflare") ||
              error.message?.includes("403")
            ) {
              console.log(
                `${scraper.getName()}: Cloudflare protection detected`,
              );
            }

            // Only fail if it's not a known temporary issue
            if (
              !error.message?.includes("cloudflare") &&
              !error.message?.includes("timeout") &&
              !error.message?.includes("ECONNREFUSED")
            ) {
              throw error;
            }
          }
        }, 30000);
      });
    });
  });

  describe("Chapter listing functionality", () => {
    // Test URLs for each source
    const testUrls: Record<string, string> = {
      MangaPark: "https://mangapark.io/title/75577-en-solo-leveling",
      AtsuMoe: "https://atsu.moe/manga/oZOG5/",
      LikeManga: "https://likemanga.in/manga/solo-leveling/",
      Manhuaus: "https://manhuaus.com/manga/solo-leveling/",
      Mgeko: "https://www.mgeko.cc/manga/solo-leveling-mg1/",
      NovelCool:
        "https://www.novelcool.com/novel/Solo-Leveling-Ragnarok-Manga.html/",
      AsuraScan: "https://asuracomic.net/series/solo-leveling-042eaa6c",
    };

    scrapers.forEach((scraper) => {
      const testUrl = testUrls[scraper.getName()];

      if (testUrl) {
        it(`${scraper.getName()} - should fetch chapters from URL`, async () => {
          try {
            const chapters = await scraper.getChapterList(testUrl);

            expect(Array.isArray(chapters)).toBe(true);

            // If we got chapters, validate structure
            if (chapters.length > 0) {
              const firstChapter = chapters[0];
              expect(firstChapter).toHaveProperty("id");
              expect(firstChapter).toHaveProperty("number");
              expect(firstChapter).toHaveProperty("url");

              expect(typeof firstChapter.number).toBe("number");
              expect(firstChapter.number).toBeGreaterThanOrEqual(0);

              console.log(
                `${scraper.getName()} chapters: ${chapters.length} found`,
              );
            } else {
              console.log(
                `${scraper.getName()} chapters: No chapters found (may be blocked)`,
              );
            }
          } catch (error: any) {
            console.error(
              `${scraper.getName()} chapter fetch failed:`,
              error.message,
            );

            // Only fail if it's not a known temporary issue
            if (
              !error.message?.includes("cloudflare") &&
              !error.message?.includes("timeout") &&
              !error.message?.includes("ECONNREFUSED")
            ) {
              throw error;
            }
          }
        }, 30000);
      }
    });
  });
});
