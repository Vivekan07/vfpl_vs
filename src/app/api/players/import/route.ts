import { NextResponse } from "next/server";
import { importPlayersFromPptx } from "@/lib/auction-db";
import type { ParsedPptxPlayer } from "@/lib/pptx-import";
import { leanAuctionState } from "@/lib/auction-state";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeIncomingPlayers(raw: unknown): ParsedPptxPlayer[] {
  if (!Array.isArray(raw)) return [];
  const players: ParsedPptxPlayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<ParsedPptxPlayer>;
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    players.push({
      name,
      role: String(row.role ?? "Footballer"),
      contact: String(row.contact ?? ""),
      playerNo: String(row.playerNo ?? ""),
      photo: typeof row.photo === "string" ? row.photo : "",
    });
  }
  return players;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      players?: unknown;
      replace?: boolean;
      startIndex?: number;
    };

    const parsed = normalizeIncomingPlayers(body.players);
    if (parsed.length === 0 && body.replace !== false) {
      return NextResponse.json(
        {
          error:
            "No player slides found. Use VMPL player profile slides with PLAYER NAME, POSITION, and CONTACT NUMBER.",
        },
        { status: 400 },
      );
    }

    const { state, count } = await importPlayersFromPptx(parsed, {
      replace: body.replace !== false,
      startIndex:
        typeof body.startIndex === "number" && Number.isFinite(body.startIndex)
          ? Math.max(0, Math.floor(body.startIndex))
          : 0,
    });
    return NextResponse.json({ ...leanAuctionState(state), imported: count });
  } catch (error) {
    console.error("POST /api/players/import", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import players",
      },
      { status: 500 },
    );
  }
}
