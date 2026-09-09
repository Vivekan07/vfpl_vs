import type { Player, Team } from "@/lib/types";

export type HistoryItem = {
  id: string;
  text: string;
  kind?: "sale" | "unsold" | "resell";
  playerId?: string;
  teamId?: string;
  bid?: number;
};

export const LIVE_STATUSES = [
  "idle",
  "player",
  "break",
  "wait",
  "sold",
  "unsold",
] as const;

export type LiveStatus = (typeof LIVE_STATUSES)[number];
export type LiveNoticeStatus = Exclude<LiveStatus, "player">;

export function isLiveStatus(value: unknown): value is LiveStatus {
  return (
    typeof value === "string" &&
    (LIVE_STATUSES as readonly string[]).includes(value)
  );
}

export const LIVE_NOTICE = {
  idle: {
    title: "Waiting for a player",
    message: "",
  },
  break: {
    title: "Auction break",
    message: "",
  },
  wait: {
    title: "Wait a moment",
    message: "",
  },
  sold: {
    title: "Signed",
    message: "Player signed to a team",
  },
  unsold: {
    title: "Unsold",
    message: "Player went unsold",
  },
} as const;

export function signedLiveMessage(
  playerName: string,
  teamName: string,
  points: number,
) {
  return `${playerName} signed to ${teamName} with ${points} points`;
}

export function unsoldLiveMessage(playerName: string) {
  return `${playerName} is unsold`;
}

export type AuctionState = {
  teams: Team[];
  pool: Player[];
  unsold: Player[];
  history: HistoryItem[];
  /** Player currently on the auction block (synced via DB). */
  currentPlayerId: string | null;
  liveStatus: LiveStatus;
  liveMessage: string;
  liveSeq?: number;
};

/** Drop photo payloads except the player currently on the block. */
export function leanAuctionState(state: AuctionState): AuctionState {
  const keepId = state.currentPlayerId;
  const strip = (player: Player): Player =>
    player.id === keepId ? player : { ...player, photo: "" };

  return {
    ...state,
    pool: state.pool.map(strip),
    unsold: state.unsold.map(strip),
    teams: state.teams.map((team) => ({
      ...team,
      players: team.players.map((slot) =>
        slot ? { ...slot, player: strip(slot.player) } : null,
      ),
    })),
  };
}
