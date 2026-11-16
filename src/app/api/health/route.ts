import { NextResponse } from "next/server";
import { getAllScrapers } from "@/lib/scrapers";
import { SHUTDOWN_SOURCE_IDS } from "@/lib/shutdown-sources";
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
const KEEP_ALIVE_MS = 5000;

let inflight: Promise<Record<string, SourceHealthResult>> | null = null;

async function runHealthCheck(): Promise<Record<string, SourceHealthResult>> {
  const scrapers = getAllScrapers().filter(
    (scraper) => !SHUTDOWN_SOURCE_IDS.has(scraper.getId()),
  );
  const healthMap = await checkAllSourcesHealth(scrapers);
  return Object.fromEntries(healthMap);
}

function streamJson(produce: () => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(" "));
      const keepAlive = setInterval(
        () => controller.enqueue(encoder.encode(" ")),
        KEEP_ALIVE_MS,
      );
      try {
        controller.enqueue(encoder.encode(JSON.stringify(await produce())));
      } catch (error: unknown) {
        console.error("Health check error:", error);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to check source health",
            }),
          ),
        );
      } finally {
        clearInterval(keepAlive);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  const now = Date.now();

  // Return cached results if still valid
  if (cachedResults && now - cachedResults.timestamp < CACHE_DURATION) {
    return NextResponse.json({
      sources: cachedResults.data,
      cached: true,
      cacheAge: Math.floor((now - cachedResults.timestamp) / 1000),
    });
  }

  return streamJson(async () => {
    if (!inflight) {
      inflight = runHealthCheck().finally(() => {
        inflight = null;
      });
    }
    const healthResults = await inflight;
    cachedResults = { data: healthResults, timestamp: Date.now() };
    return { sources: healthResults, cached: false };
  });
}

// Force refresh cache
export async function POST() {
  cachedResults = null;
  return GET();
}
