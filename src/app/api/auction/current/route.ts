import { NextResponse } from "next/server";
import {
  getCurrentAuctionMeta,
  getCurrentAuctionPlayer,
  setCurrentAuctionView,
} from "@/lib/auction-db";
import { LIVE_STATUSES, type LiveStatus } from "@/lib/auction-state";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const meta = new URL(request.url).searchParams.get("meta") === "1";
    const current = meta
      ? await getCurrentAuctionMeta()
      : await getCurrentAuctionPlayer();
    return NextResponse.json(current);
  } catch (error) {
    console.error("GET /api/auction/current", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load current auction player",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      playerId?: string | null;
      liveStatus?: LiveStatus;
      liveMessage?: string;
      liveSeq?: number;
    };

    const liveStatus =
      body.liveStatus && LIVE_STATUSES.includes(body.liveStatus)
        ? body.liveStatus
        : undefined;

    const patch: {
      playerId?: string | null;
      liveStatus?: LiveStatus;
      liveMessage?: string;
      liveSeq?: number;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, "playerId")) {
      patch.playerId =
        typeof body.playerId === "string" && body.playerId
          ? body.playerId
          : null;
    }

    if (liveStatus) {
      patch.liveStatus = liveStatus;
      patch.liveMessage =
        typeof body.liveMessage === "string" ? body.liveMessage : "";
    }

    if (typeof body.liveSeq === "number") {
      patch.liveSeq = body.liveSeq;
    }

    const current = await setCurrentAuctionView(patch);
    return NextResponse.json(current);
  } catch (error) {
    console.error("PUT /api/auction/current", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save current auction player",
      },
      { status: 500 },
    );
  }
}
