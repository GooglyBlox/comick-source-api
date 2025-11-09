import { NextResponse } from "next/server";
import { getAllSourceInfo } from "@/lib/scrapers";

export async function GET() {
  try {
    const sources = getAllSourceInfo();
    return NextResponse.json({ sources });
  } catch (error: unknown) {
    console.error("Sources error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch sources",
      },
      { status: 500 },
    );
  }
}
