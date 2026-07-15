import { NextRequest, NextResponse } from "next/server";
import { getScraperByName, getAllScrapers } from "@/lib/scrapers";
import { BaseScraper } from "@/lib/scrapers/base";

export const runtime = "nodejs";

const SCRAPER_TIMEOUT_MS = 20000;

interface StreamingSearchResult {
  source: string;
  results: unknown[];
  error?: string;
  done: boolean;
}

interface FinalSummary {
  done: true;
  totalSources: number;
  completedSources: number;
  failedSources: number;
}

async function searchWithTimeout(
  scraper: BaseScraper,
  query: string,
  timeoutMs: number
): Promise<StreamingSearchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[Search] Starting search for ${scraper.getName()} with query: "${query}"`);
    
    const results = await Promise.race([
      scraper.search(query),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`Timeout after ${timeoutMs}ms`));
        });
      }),
    ]);

    console.log(`[Search] ${scraper.getName()} returned ${results.length} results`);
    return {
      source: scraper.getName(),
      results,
      done: false,
    };
  } catch (error) {
    console.error(`[Search] Error searching ${scraper.getName()}:`, error);
    return {
      source: scraper.getName(),
      results: [],
      error: error instanceof Error ? error.message : "Search failed",
      done: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function handleAllSourcesSearch(query: string): Response {
  const scrapers = getAllScrapers();
  let completedCount = 0;
  let failedCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const searchPromises = scrapers.map(async (scraper) => {
        const result = await searchWithTimeout(scraper, query, SCRAPER_TIMEOUT_MS);
        
        completedCount++;
        if (result.error) {
          failedCount++;
        }

        const line = JSON.stringify(result) + "\n";
        controller.enqueue(encoder.encode(line));
      });

      await Promise.all(searchPromises);

      const summary: FinalSummary = {
        done: true,
        totalSources: scrapers.length,
        completedSources: completedCount,
        failedSources: failedCount,
      };
      controller.enqueue(encoder.encode(JSON.stringify(summary) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { query, source } = await request.json();

    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 },
      );
    }

    if (!source || source === "all") {
      return handleAllSourcesSearch(query.trim());
    }

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
