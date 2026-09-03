import { NextResponse } from "next/server";
import { importPlayersFromPptx } from "@/lib/auction-db";
import { parsePptxPlayers } from "@/lib/pptx-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a .pptx file" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return NextResponse.json(
        { error: "Only .pptx files are supported" },
        { status: 400 },
      );
    }

    const parsed = await parsePptxPlayers(await file.arrayBuffer());
    if (parsed.length === 0) {
      return NextResponse.json(
        {
          error:
            "No player slides found. Use VMPL player profile slides with PLAYER NAME, POSITION, and CONTACT NUMBER.",
        },
        { status: 400 },
      );
    }

    const { state, count } = await importPlayersFromPptx(parsed);
    return NextResponse.json({ ...state, imported: count });
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
