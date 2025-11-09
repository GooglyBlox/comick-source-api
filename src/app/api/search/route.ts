import { NextRequest, NextResponse } from "next/server";
import { getScraperByName, getAllScrapers } from "@/lib/scrapers";

export async function POST(request: NextRequest) {
  try {
    const { query, source } = await request.json();

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 },
      );
    }

    // If source is "all" or not provided, search all sources
    if (!source || source === "all") {
      const scrapers = getAllScrapers();
      const searchPromises = scrapers.map(async (scraper) => {
        try {
          const results = await scraper.search(query.trim());
          return {
            source: scraper.getName(),
            results,
          };
        } catch (error) {
          console.error(`Error searching ${scraper.getName()}:`, error);
          return {
            source: scraper.getName(),
            results: [],
            error: error instanceof Error ? error.message : "Search failed",
          };
        }
      });

      const allResults = await Promise.all(searchPromises);
      return NextResponse.json({ sources: allResults });
    }

    // Search specific source
    const scraper = getScraperByName(source);
    if (!scraper) {
      const availableSources = getAllScrapers().map((s) =>
        s.getName().toLowerCase(),
      );
      return NextResponse.json(
        {
          error: `Unsupported source. Available sources: ${availableSources.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const results = await scraper.search(query.trim());
    return NextResponse.json({ results, source: scraper.getName() });
  } catch (error: unknown) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search" },
      { status: 500 },
    );
  }
}
