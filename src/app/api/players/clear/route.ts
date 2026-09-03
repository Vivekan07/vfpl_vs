import { NextResponse } from "next/server";
import { clearPlayersDatabase } from "@/lib/auction-db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await clearPlayersDatabase();
    return NextResponse.json(state);
  } catch (error) {
    console.error("POST /api/players/clear", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to clear player database",
      },
      { status: 500 },
    );
  }
}
