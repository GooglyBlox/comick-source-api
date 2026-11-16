import { BaseScraper } from "@/lib/scrapers/base";

export enum SourceStatus {
  HEALTHY = "healthy",
  CLOUDFLARE = "cloudflare",
  TIMEOUT = "timeout",
  ERROR = "error",
}

const HEALTH_CHECK_TIMEOUT_MS = 15000;
const ALL_SOURCES_TIMEOUT_MS = 100000;
const HEALTH_CHECK_CONCURRENCY = 10;
const HEALTH_CHECK_QUERIES = ["the", "a"];

export interface SourceHealthResult {
  status: SourceStatus;
  message: string;
  responseTime?: number;
  lastChecked: string;
}

/**
 * Detects if a response is blocked by Cloudflare
 */
export function detectCloudflare(html: string, headers?: Headers): boolean {
  // Check for common Cloudflare patterns
  const cloudflarePatterns = [
    /cloudflare/i,
    /cf-ray/i,
    /checking your browser/i,
    /enable javascript and cookies/i,
    /ddos protection by cloudflare/i,
    /attention required.*cloudflare/i,
    /challenge-platform/i,
    /cf-chl-bypass/i,
  ];

  // Check HTML content
  for (const pattern of cloudflarePatterns) {
    if (pattern.test(html)) {
      return true;
    }
  }

  // Check headers if available
  if (headers) {
    const serverHeader = headers.get("server");
    const cfRay = headers.get("cf-ray");

    if (serverHeader?.toLowerCase().includes("cloudflare") || cfRay) {
      // Having Cloudflare headers doesn't mean it's blocking
      // Only return true if we also see blocking patterns in HTML
      return cloudflarePatterns.some((pattern) => pattern.test(html));
    }
  }

  return false;
}

/**
 * Test if a source is healthy by attempting a search
 */
export async function checkSourceHealth(
  scraper: BaseScraper,
  testQueries: string | string[] = HEALTH_CHECK_QUERIES,
): Promise<SourceHealthResult> {
  const startTime = Date.now();
  const lastChecked = new Date().toISOString();
  const queries = Array.isArray(testQueries) ? testQueries : [testQueries];

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ timedOut: true }),
      HEALTH_CHECK_TIMEOUT_MS,
    );
  });

  const searchPromise = (async () => {
    let results: unknown = [];
    for (const query of queries) {
      results = await scraper.search(query);
      if (!Array.isArray(results) || results.length > 0) break;
    }
    return { timedOut: false as const, results };
  })();

  try {
    const result = await Promise.race([searchPromise, timeoutPromise]);
    const responseTime = Date.now() - startTime;

    if (result.timedOut) {
      return {
        status: SourceStatus.TIMEOUT,
        message: `Source took longer than ${HEALTH_CHECK_TIMEOUT_MS / 1000}s to respond`,
        responseTime,
        lastChecked,
      };
    }

    if (Array.isArray(result.results) && result.results.length === 0) {
      return {
        status: SourceStatus.ERROR,
        message: `Search returned no results for ${queries.map((q) => `"${q}"`).join(" or ")}`,
        responseTime,
        lastChecked,
      };
    }

    if (Array.isArray(result.results)) {
      return {
        status: SourceStatus.HEALTHY,
        message: "Source is operational",
        responseTime,
        lastChecked,
      };
    }

    return {
      status: SourceStatus.ERROR,
      message: "Unexpected response format",
      responseTime,
      lastChecked,
    };
  } catch (error: unknown) {
    const responseTime = Date.now() - startTime;

    // Type guard to check if error is an Error-like object
    const isErrorWithMessage = (
      err: unknown,
    ): err is { message: string; name?: string } => {
      return typeof err === "object" && err !== null && "message" in err;
    };

    const isErrorWithResponse = (
      err: unknown,
    ): err is { response: { text: () => Promise<string> } } => {
      return typeof err === "object" && err !== null && "response" in err;
    };

    // Check if it's a timeout
    if (
      isErrorWithMessage(error) &&
      (error.name === "TimeoutError" || error.message?.includes("timeout"))
    ) {
      return {
        status: SourceStatus.TIMEOUT,
        message: "Request timed out",
        responseTime,
        lastChecked,
      };
    }

    // Check if error message contains Cloudflare indicators
    const errorMessage = isErrorWithMessage(error) ? error.message : "";
    if (
      errorMessage.toLowerCase().includes("cloudflare") ||
      errorMessage.includes("cf-ray") ||
      errorMessage.toLowerCase().includes("challenge")
    ) {
      return {
        status: SourceStatus.CLOUDFLARE,
        message: "Cloudflare protection detected",
        responseTime,
        lastChecked,
      };
    }

    // Try to detect Cloudflare from response if available
    if (isErrorWithResponse(error)) {
      const html = await error.response.text().catch(() => "");
      if (detectCloudflare(html)) {
        return {
          status: SourceStatus.CLOUDFLARE,
          message: "Cloudflare protection detected",
          responseTime,
          lastChecked,
        };
      }
    }

    return {
      status: SourceStatus.ERROR,
      message: isErrorWithMessage(error) ? error.message : "Unknown error",
      responseTime,
      lastChecked,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Check health of all sources
 */
export async function checkAllSourcesHealth(
  scrapers: BaseScraper[],
): Promise<Map<string, SourceHealthResult>> {
  const results = new Map<string, SourceHealthResult>();
  const getSourceName = (scraper: BaseScraper) => scraper.getId();

  let deadlineId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineId = setTimeout(resolve, ALL_SOURCES_TIMEOUT_MS);
  });
  const lastChecked = new Date().toISOString();
  const queue = [...scrapers];
  let stopped = false;

  const worker = async () => {
    while (!stopped) {
      const scraper = queue.shift();
      if (!scraper) return;
      results.set(getSourceName(scraper), await checkSourceHealth(scraper));
    }
  };

  await Promise.race([
    Promise.all(Array.from({ length: HEALTH_CHECK_CONCURRENCY }, worker)),
    deadline,
  ]);
  stopped = true;
  clearTimeout(deadlineId);

  const finalResults = new Map(results);
  for (const scraper of scrapers) {
    const sourceName = getSourceName(scraper);
    if (!finalResults.has(sourceName)) {
      finalResults.set(sourceName, {
        status: SourceStatus.TIMEOUT,
        message: `Health check did not finish within ${ALL_SOURCES_TIMEOUT_MS / 1000}s`,
        responseTime: ALL_SOURCES_TIMEOUT_MS,
        lastChecked,
      });
    }
  }

  return finalResults;
}
