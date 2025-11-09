import { NextRequest, NextResponse } from "next/server";
import { getScraper, getScraperByName } from "@/lib/scrapers";

export async function POST(request: NextRequest) {
  try {
    const { url, source } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let scraper;

    // Try to get scraper by source name first
    if (source) {
      scraper = getScraperByName(source);
    }

    // Fallback to URL detection
    if (!scraper) {
      scraper = getScraper(url);
    }

    if (!scraper) {
      return NextResponse.json(
        {
          error:
            "No scraper found for this URL. Please provide a valid manga URL or source name.",
        },
        { status: 400 },
      );
    }

    const chapters = await scraper.getChapterList(url);

    return NextResponse.json({
      chapters,
      source: scraper.getName(),
      totalChapters: chapters.length,
    });
  } catch (error: unknown) {
    console.error("Chapters error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch chapters",
      },
      { status: 500 },
    );
  }
}
