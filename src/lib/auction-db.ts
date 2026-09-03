import { compressPhotoDataUrl } from "@/lib/compress-photo";
import { TEAM_DEFINITIONS, createInitialTeams } from "@/lib/data";
import type { ParsedPptxPlayer } from "@/lib/pptx-import";
import { getSql, type Sql } from "@/lib/db";
import type {
  AuctionState,
  HistoryItem,
  LiveStatus,
} from "@/lib/auction-state";
import { isLiveStatus } from "@/lib/auction-state";
import {
  DEFAULT_BASE_PRICE,
  SLOT_COUNT,
  TEAM_POINTS,
  type Player,
  type SoldPlayer,
  type Team,
} from "@/lib/types";

type SlotSnap = { playerId: string; bid: number } | null;

type StatePayload = {
  teams: {
    id: string;
    points: number;
    slots: SlotSnap[];
  }[];
  unsoldIds: string[];
  history: HistoryItem[];
  currentPlayerId: string | null;
  liveStatus: LiveStatus;
  liveMessage: string;
  liveUpdatedAt?: number;
  liveSeq?: number;
};

let bootPromise: Promise<void> | null = null;

function toPlayer(row: {
  id: string;
  name: string;
  base_price: number;
  player_no: string | null;
  designation?: string | null;
  role?: string | null;
  contact?: string | null;
  photo?: string | null;
}): Player {
  return {
    id: row.id,
    name: row.name,
    role: row.role ?? "Footballer",
    playerNo: row.player_no ?? "",
    contact: row.contact ?? "",
    designation: row.designation ?? "",
    photo: row.photo ?? "",
    basePrice: Number(row.base_price) || DEFAULT_BASE_PRICE,
  };
}

function emptyPayload(): StatePayload {
  return {
    teams: TEAM_DEFINITIONS.map((team) => ({
      id: team.id,
      points: TEAM_POINTS,
      slots: Array.from({ length: SLOT_COUNT }, () => null),
    })),
    unsoldIds: [],
    history: [],
    currentPlayerId: null,
    liveStatus: "idle",
    liveMessage: "",
    liveUpdatedAt: 0,
  };
}

function stateToPayload(state: AuctionState): StatePayload {
  return {
    teams: state.teams.map((team) => ({
      id: team.id,
      points: team.points,
      slots: team.players.map((slot) =>
        slot ? { playerId: slot.player.id, bid: slot.bid } : null,
      ),
    })),
    unsoldIds: state.unsold.map((player) => player.id),
    history: state.history.slice(0, 12),
    currentPlayerId: state.currentPlayerId ?? null,
    liveStatus: state.liveStatus ?? "idle",
    liveMessage: state.liveMessage ?? "",
    liveSeq: state.liveSeq,
  };
}

function buildState(
  playersById: Map<string, Player>,
  payload: StatePayload,
): AuctionState {
  const soldIds = new Set<string>();
  const teams: Team[] = TEAM_DEFINITIONS.map((def, index) => {
    const snap =
      payload.teams.find((team) => team.id === def.id) ??
      payload.teams[index] ?? {
        id: def.id,
        points: TEAM_POINTS,
        slots: [],
      };

    const slots: (SoldPlayer | null)[] = Array.from(
      { length: SLOT_COUNT },
      () => null,
    );
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = snap.slots[i];
      if (!slot) continue;
      const player = playersById.get(slot.playerId);
      if (!player) continue;
      slots[i] = { player, bid: Number(slot.bid) || DEFAULT_BASE_PRICE };
      soldIds.add(player.id);
    }

    return {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      color: def.color,
      logo: def.logo,
      points: Number.isFinite(snap.points) ? snap.points : TEAM_POINTS,
      players: slots,
    };
  });

  const unsoldIds = new Set(payload.unsoldIds);
  const pool = [...playersById.values()].filter(
    (player) => !soldIds.has(player.id) && !unsoldIds.has(player.id),
  );
  const unsold = [...playersById.values()].filter((player) =>
    unsoldIds.has(player.id),
  );

  return {
    teams,
    pool,
    unsold,
    history: Array.isArray(payload.history) ? payload.history.slice(0, 12) : [],
    currentPlayerId: payload.currentPlayerId ?? null,
    liveStatus: isLiveStatus(payload.liveStatus) ? payload.liveStatus : "idle",
    liveMessage: payload.liveMessage ?? "",
    liveSeq: payload.liveSeq,
  };
}

async function ensureSchema(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_price INTEGER NOT NULL DEFAULT 100,
      player_no TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      designation TEXT NOT NULL DEFAULT ''
    )
  `;
  await sql`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS designation TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Footballer'
  `;
  await sql`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS contact TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    ALTER TABLE players
    ADD COLUMN IF NOT EXISTS photo TEXT NOT NULL DEFAULT ''
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS auction_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Keep legacy tables if they exist; used only for one-time migration.
  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      color TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 6000,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sales (
      team_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      bid INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      PRIMARY KEY (team_id, slot_index)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS unsold (
      player_id TEXT PRIMARY KEY
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

/** If auction has no sales yet, bump team budgets to current TEAM_POINTS. */
async function syncStartingPoints(sql: Sql) {
  const rows = await sql`SELECT payload FROM auction_state WHERE id = 1 LIMIT 1`;
  if (!rows[0]?.payload) return;

  const raw = rows[0].payload;
  const payload: StatePayload =
    typeof raw === "string" ? JSON.parse(raw) : (raw as StatePayload);

  const hasSales = (payload.teams ?? []).some((team) =>
    (team.slots ?? []).some((slot) => slot !== null),
  );
  if (hasSales) return;

  let changed = false;
  for (const team of payload.teams ?? []) {
    if (team.points !== TEAM_POINTS) {
      team.points = TEAM_POINTS;
      changed = true;
    }
  }
  if (changed) await writePayload(sql, payload);
}

async function migrateLegacyIfNeeded(sql: Sql) {
  const existing = await sql`SELECT id FROM auction_state WHERE id = 1 LIMIT 1`;
  if (existing.length > 0) return;

  const teamRows = await sql`
    SELECT id, points FROM teams ORDER BY sort_order ASC, id ASC
  `;
  const saleRows = await sql`
    SELECT team_id, player_id, bid, slot_index FROM sales
  `;
  const unsoldRows = await sql`SELECT player_id FROM unsold`;
  const historyRows = await sql`
    SELECT id, text FROM history ORDER BY created_at DESC LIMIT 12
  `;

  const payload = emptyPayload();

  if (teamRows.length > 0 || saleRows.length > 0) {
    for (const team of payload.teams) {
      const row = teamRows.find((item) => item.id === team.id);
      if (row) team.points = Number(row.points);
      for (const sale of saleRows) {
        if (sale.team_id !== team.id) continue;
        const index = Number(sale.slot_index);
        if (index < 0 || index >= SLOT_COUNT) continue;
        team.slots[index] = {
          playerId: sale.player_id as string,
          bid: Number(sale.bid),
        };
      }
    }
    payload.unsoldIds = unsoldRows.map((row) => row.player_id as string);
    payload.history = historyRows.map((row) => ({
      id: row.id as string,
      text: row.text as string,
    }));
  }

  await sql`
    INSERT INTO auction_state (id, payload, updated_at)
    VALUES (1, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

async function boot(sql: Sql) {
  if (!bootPromise) {
    bootPromise = (async () => {
      await ensureSchema(sql);
      await migrateLegacyIfNeeded(sql);
      // Players come only from PPTX import — do not re-seed a built-in roster.
      await syncStartingPoints(sql);
    })().catch((error) => {
      bootPromise = null;
      throw error;
    });
  }
  await bootPromise;
}

async function loadPlayers(
  sql: Sql,
  photoId?: string | null,
): Promise<Map<string, Player>> {
  const playerRows = await sql`
    SELECT id, name, base_price, player_no, designation, role, contact, '' AS photo
    FROM players
    ORDER BY sort_order ASC, id ASC
  `;
  const players = new Map(
    playerRows.map((row) => [
      row.id as string,
      toPlayer(row as Parameters<typeof toPlayer>[0]),
    ]),
  );

  if (photoId && players.has(photoId)) {
    const photoRows = await sql`
      SELECT photo FROM players WHERE id = ${photoId} LIMIT 1
    `;
    const current = players.get(photoId);
    if (current) current.photo = String(photoRows[0]?.photo ?? "");
  }

  return players;
}

async function readPayload(sql: Sql): Promise<StatePayload> {
  const rows = await sql`SELECT payload FROM auction_state WHERE id = 1 LIMIT 1`;
  if (!rows[0]?.payload) return emptyPayload();
  const raw = rows[0].payload;
  return typeof raw === "string" ? (JSON.parse(raw) as StatePayload) : (raw as StatePayload);
}

async function writePayload(sql: Sql, payload: StatePayload) {
  payload.liveUpdatedAt =
    payload.liveSeq ?? payload.liveUpdatedAt ?? Date.now();
  await sql`
    INSERT INTO auction_state (id, payload, updated_at)
    VALUES (1, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = NOW()
  `;
}

export async function loadAuctionState(): Promise<AuctionState> {
  const sql = getSql();
  await boot(sql);
  const payload = await readPayload(sql);
  const playersById = await loadPlayers(sql, payload.currentPlayerId);
  return buildState(playersById, payload);
}

export async function saveAuctionState(state: AuctionState): Promise<AuctionState> {
  const sql = getSql();
  await boot(sql);
  const existing = await readPayload(sql);
  if (
    typeof state.liveSeq === "number" &&
    typeof existing.liveSeq === "number" &&
    state.liveSeq < existing.liveSeq
  ) {
    const playersById = await loadPlayers(sql, existing.currentPlayerId);
    return buildState(playersById, existing);
  }
  const payload = stateToPayload(state);
  await writePayload(sql, payload);
  // Return the client state immediately - no full reload round-trip.
  return {
    teams: state.teams,
    pool: state.pool,
    unsold: state.unsold,
    history: state.history.slice(0, 12),
    currentPlayerId: state.currentPlayerId ?? null,
    liveStatus: state.liveStatus ?? "idle",
    liveMessage: state.liveMessage ?? "",
    liveSeq: state.liveSeq ?? payload.liveSeq,
  };
}

/** Clears all signings, unsold, history, and restores every club budget. */
export async function resetAuctionState(): Promise<AuctionState> {
  const sql = getSql();
  await boot(sql);

  const payload = emptyPayload();
  payload.liveSeq = Date.now();
  payload.liveUpdatedAt = payload.liveSeq;
  payload.liveStatus = "idle";
  payload.liveMessage = "";
  payload.currentPlayerId = null;

  await writePayload(sql, payload);

  try {
    await Promise.all([
      sql`DELETE FROM sales`,
      sql`DELETE FROM unsold`,
      sql`DELETE FROM history`,
      sql`UPDATE teams SET points = ${TEAM_POINTS}`,
    ]);
  } catch (error) {
    console.error("Legacy auction tables reset", error);
  }

  const playersById = await loadPlayers(sql);
  return buildState(playersById, payload);
}

function formatPlayerNo(raw: string, index: number): string {
  const digits = raw.replace(/\D/g, "");
  // Only accept real jersey/profile numbers (1–999). Ignore "0"/"00" parse noise.
  if (digits && Number(digits) > 0 && digits.length <= 3) {
    return `No. ${String(Number(digits)).padStart(2, "0")}`;
  }
  return `No. ${String(index + 1).padStart(2, "0")}`;
}

/** Replace all players from a parsed PPTX and persist them in the database. */
export async function importPlayersFromPptx(
  parsed: ParsedPptxPlayer[],
): Promise<{ state: AuctionState; count: number }> {
  const sql = getSql();
  await boot(sql);

  await sql`DELETE FROM players`;
  await writePayload(sql, emptyPayload());

  if (parsed.length === 0) {
    return { state: await loadAuctionState(), count: 0 };
  }

  const ids = parsed.map((_, i) => `p${i + 1}`);
  const names = parsed.map((p) => p.name);
  const prices = parsed.map(() => DEFAULT_BASE_PRICE);
  const nos = parsed.map((p, i) => formatPlayerNo(p.playerNo, i));
  const orders = parsed.map((_, i) => i);
  const designations = parsed.map(() => "");
  const roles = parsed.map((p) => p.role || "Footballer");
  const contacts = parsed.map((p) => p.contact);
  const photos: string[] = [];
  for (const player of parsed) {
    photos.push(await compressPhotoDataUrl(player.photo));
  }

  await sql`
    INSERT INTO players (id, name, base_price, player_no, sort_order, designation, role, contact, photo)
    SELECT * FROM UNNEST(
      ${ids}::text[],
      ${names}::text[],
      ${prices}::int[],
      ${nos}::text[],
      ${orders}::int[],
      ${designations}::text[],
      ${roles}::text[],
      ${contacts}::text[],
      ${photos}::text[]
    )
  `;

  return { state: await loadAuctionState(), count: parsed.length };
}

/** Wipe every player from the database and clear the live auction. */
export async function clearPlayersDatabase(): Promise<AuctionState> {
  const sql = getSql();
  await boot(sql);

  await sql`DELETE FROM players`;
  await writePayload(sql, emptyPayload());

  await Promise.all([
    sql`DELETE FROM sales`,
    sql`DELETE FROM unsold`,
    sql`DELETE FROM history`,
    sql`UPDATE teams SET points = ${TEAM_POINTS}`,
  ]);

  return buildState(new Map(), emptyPayload());
}

export type CurrentAuctionMeta = {
  currentPlayerId: string | null;
  liveStatus: LiveStatus;
  liveMessage: string;
  liveUpdatedAt: number;
};

export type CurrentAuctionView = CurrentAuctionMeta & {
  player: Player | null;
};

export async function getCurrentAuctionMeta(): Promise<CurrentAuctionMeta> {
  const sql = getSql();
  await boot(sql);
  const payload = await readPayload(sql);
  return {
    currentPlayerId: payload.currentPlayerId ?? null,
    liveStatus: isLiveStatus(payload.liveStatus) ? payload.liveStatus : "idle",
    liveMessage: payload.liveMessage ?? "",
    liveUpdatedAt: payload.liveUpdatedAt ?? payload.liveSeq ?? 0,
  };
}

export async function getCurrentAuctionPlayer(): Promise<CurrentAuctionView> {
  const sql = getSql();
  await boot(sql);
  const payload = await readPayload(sql);
  const currentPlayerId = payload.currentPlayerId ?? null;
  const liveStatus = isLiveStatus(payload.liveStatus)
    ? payload.liveStatus
    : "idle";
  const liveMessage = payload.liveMessage ?? "";
  const liveUpdatedAt = payload.liveUpdatedAt ?? 0;

  if (!currentPlayerId || liveStatus !== "player") {
    return { currentPlayerId, player: null, liveStatus, liveMessage, liveUpdatedAt };
  }

  const rows = await sql`
    SELECT id, name, base_price, player_no, designation, role, contact, photo
    FROM players
    WHERE id = ${currentPlayerId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return { currentPlayerId, player: null, liveStatus, liveMessage, liveUpdatedAt };
  }

  const player = toPlayer(row as Parameters<typeof toPlayer>[0]);
  const compressed = await compressPhotoDataUrl(player.photo);
  if (compressed && compressed !== player.photo && compressed.length < player.photo.length) {
    player.photo = compressed;
    await sql`UPDATE players SET photo = ${compressed} WHERE id = ${currentPlayerId}`;
  }

  return { currentPlayerId, player, liveStatus, liveMessage, liveUpdatedAt };
}

export async function setCurrentAuctionView(input: {
  playerId?: string | null;
  liveStatus?: LiveStatus;
  liveMessage?: string;
  liveSeq?: number;
}): Promise<CurrentAuctionMeta> {
  const sql = getSql();
  await boot(sql);
  const payload = await readPayload(sql);

  if (
    typeof input.liveSeq === "number" &&
    typeof payload.liveSeq === "number" &&
    input.liveSeq < payload.liveSeq
  ) {
    return getCurrentAuctionMeta();
  }

  if (typeof input.liveSeq === "number") {
    payload.liveSeq = input.liveSeq;
  }

  if (input.playerId) {
    payload.currentPlayerId = input.playerId;
    payload.liveStatus = "player";
    payload.liveMessage = "";
  } else if (
    input.liveStatus === "break" ||
    input.liveStatus === "wait" ||
    input.liveStatus === "sold" ||
    input.liveStatus === "unsold"
  ) {
    payload.currentPlayerId = null;
    payload.liveStatus = input.liveStatus;
    payload.liveMessage = input.liveMessage ?? "";
  } else if (input.liveStatus === "idle" || input.playerId === null) {
    payload.currentPlayerId = null;
    payload.liveStatus = "idle";
    payload.liveMessage = "";
  }

  await writePayload(sql, payload);
  return getCurrentAuctionMeta();
}

/** @deprecated Use setCurrentAuctionView */
export async function setCurrentAuctionPlayer(playerId: string | null) {
  return setCurrentAuctionView({ playerId });
}

export function emptyAuctionState(): AuctionState {
  return {
    teams: createInitialTeams(),
    pool: [],
    unsold: [],
    history: [],
    currentPlayerId: null,
    liveStatus: "idle",
    liveMessage: "",
  };
}
