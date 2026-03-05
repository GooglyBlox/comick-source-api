import { NextRequest, NextResponse } from "next/server";
import { getScraper, getScraperByName } from "@/lib/scrapers";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    const { url, source } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    let scraper;

    if (source) {
      scraper = getScraperByName(source);
    }

    if (!scraper) {
      scraper = getScraper(url);
    }

    if (!scraper) {
      return NextResponse.json(
        {
          error:
            "No scraper found for this URL. Please provide a valid chapter URL or source name.",
        },
        { status: 400 },
      );
    }

    if (!scraper.supportsChapterImages()) {
      return NextResponse.json(
        {
          error: `${scraper.getName()} does not support fetching chapter images`,
        },
        { status: 400 },
      );
    }

    const images = await scraper.getChapterImages(url);

    return NextResponse.json({
      images,
      source: scraper.getName(),
      totalPages: images.length,
    });
  } catch (error: unknown) {
    console.error("Chapter images error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch chapter images",
      },
      { status: 500 },
    );
  }
}
