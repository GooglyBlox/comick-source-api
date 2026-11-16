import { NextResponse } from "next/server";
import { getAllScrapers } from "@/lib/scrapers";
import { SHUTDOWN_SOURCE_IDS } from "@/lib/shutdown-sources";
import {
  checkAllSourcesHealth,
  SourceHealthResult,
} from "@/lib/utils/source-health";

export const runtime = "nodejs";
export const maxDuration = 120;

// Cache health results for 5 minutes to avoid hammering sources
let cachedResults: {
  data: Record<string, SourceHealthResult>;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let inflight: Promise<Record<string, SourceHealthResult>> | null = null;

async function runHealthCheck(): Promise<Record<string, SourceHealthResult>> {
  const scrapers = getAllScrapers().filter(
    (scraper) => !SHUTDOWN_SOURCE_IDS.has(scraper.getId()),
  );
  const healthMap = await checkAllSourcesHealth(scrapers);
  return Object.fromEntries(healthMap);
}

export async function GET() {
  try {
    const now = Date.now();

    // Return cached results if still valid
    if (cachedResults && now - cachedResults.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        sources: cachedResults.data,
        cached: true,
        cacheAge: Math.floor((now - cachedResults.timestamp) / 1000),
      });
    }

    if (!inflight) {
      inflight = runHealthCheck().finally(() => {
        inflight = null;
      });
    }
    const healthResults = await inflight;

    cachedResults = {
      data: healthResults,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      sources: healthResults,
      cached: false,
    });
  } catch (error: unknown) {
    console.error("Health check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check source health",
      },
      { status: 500 },
    );
  }
}

// Force refresh cache
export async function POST() {
  try {
    cachedResults = null;
    return GET();
  } catch (error: unknown) {
    console.error("Health check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check source health",
      },
      { status: 500 },
    );
  }
}
