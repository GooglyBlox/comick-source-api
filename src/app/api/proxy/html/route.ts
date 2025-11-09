import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return NextResponse.json(
        { error: "Missing URL parameter" },
        { status: 400 },
      );
    }

    const decodedUrl = decodeURIComponent(targetUrl);

    // Only allow AsuraScans URLs
    const isAsuraScanDomain =
      /https?:\/\/(www\.)?asuracomic\.net/.test(decodedUrl);

    if (!isAsuraScanDomain) {
      return NextResponse.json(
        { error: "Invalid URL - only AsuraScans URLs are allowed" },
        { status: 400 },
      );
    }

    const response = await fetch(decodedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://asuracomic.net/",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch HTML: ${response.status} ${response.statusText}`,
      );
      return NextResponse.json(
        {
          error: `Failed to fetch HTML: ${response.status}`,
          details: response.statusText,
        },
        { status: response.status },
      );
    }

    const html = await response.text();

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("HTML proxy error:", error);
    return NextResponse.json(
      {
        error: "Failed to proxy HTML",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
