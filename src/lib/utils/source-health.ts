import { BaseScraper } from "@/lib/scrapers/base";

export enum SourceStatus {
  HEALTHY = "healthy",
  CLOUDFLARE = "cloudflare",
  TIMEOUT = "timeout",
  ERROR = "error",
}

const HEALTH_CHECK_TIMEOUT_MS = 15000;

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
  testQuery: string = "test",
): Promise<SourceHealthResult> {
  const startTime = Date.now();
  const lastChecked = new Date().toISOString();

  const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), HEALTH_CHECK_TIMEOUT_MS);
  });

  const searchPromise = scraper.search(testQuery).then((results) => ({
    timedOut: false as const,
    results,
  }));

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
  }
}

/**
 * Check health of all sources
 */
export async function checkAllSourcesHealth(
  scrapers: BaseScraper[],
): Promise<Map<string, SourceHealthResult>> {
  const results = new Map<string, SourceHealthResult>();

  await Promise.all(
    scrapers.map(async (scraper) => {
      const sourceName = scraper.getName().toLowerCase().replace(/\s+/g, "-");
      const health = await checkSourceHealth(scraper);
      results.set(sourceName, health);
    }),
  );

  return results;
}
