import { NextResponse } from "next/server";
import { getAllScrapers } from "@/lib/scrapers";
import {
  checkAllSourcesHealth,
  SourceHealthResult,
} from "@/lib/utils/source-health";

export const runtime = "edge";

// Cache health results for 5 minutes to avoid hammering sources
let cachedResults: {
  data: Record<string, SourceHealthResult>;
  timestamp: number;
} | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

    // Check health of all sources
    const scrapers = getAllScrapers();
    const healthMap = await checkAllSourcesHealth(scrapers);

    // Convert Map to object for JSON serialization
    const healthResults: Record<string, SourceHealthResult> = {};
    healthMap.forEach((health, sourceName) => {
      healthResults[sourceName] = health;
    });

    // Update cache
    cachedResults = {
      data: healthResults,
      timestamp: now,
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
