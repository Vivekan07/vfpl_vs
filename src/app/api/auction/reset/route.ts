import { NextResponse } from "next/server";
import { resetAuctionState } from "@/lib/auction-db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await resetAuctionState();
    return NextResponse.json(state);
  } catch (error) {
    console.error("POST /api/auction/reset", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset auction" },
      { status: 500 },
    );
  }
}
