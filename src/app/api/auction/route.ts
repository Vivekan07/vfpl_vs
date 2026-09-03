import { NextResponse } from "next/server";
import { loadAuctionState, saveAuctionState } from "@/lib/auction-db";
import {
  leanAuctionState,
  type AuctionState,
} from "@/lib/auction-state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const lean = new URL(request.url).searchParams.get("lean") === "1";
    const state = await loadAuctionState();
    return NextResponse.json(lean ? leanAuctionState(state) : state);
  } catch (error) {
    console.error("GET /api/auction", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load auction" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<AuctionState>;
    if (!body?.teams || !Array.isArray(body.teams)) {
      return NextResponse.json({ error: "Invalid auction state" }, { status: 400 });
    }
    const state = await saveAuctionState({
      teams: body.teams,
      pool: Array.isArray(body.pool) ? body.pool : [],
      unsold: Array.isArray(body.unsold) ? body.unsold : [],
      history: Array.isArray(body.history) ? body.history : [],
      currentPlayerId:
        typeof body.currentPlayerId === "string" ? body.currentPlayerId : null,
      liveStatus: body.liveStatus ?? "idle",
      liveMessage: body.liveMessage ?? "",
      liveSeq: typeof body.liveSeq === "number" ? body.liveSeq : undefined,
    });
    return NextResponse.json(leanAuctionState(state));
  } catch (error) {
    console.error("PUT /api/auction", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save auction" },
      { status: 500 },
    );
  }
}
