export type Player = {
  id: string;
  name: string;
  role: string;
  playerNo: string;
  contact: string;
  designation: string;
  photo: string;
  basePrice: number;
};

/** Jersey / profile number as "07", or empty if missing. */
export function displayPlayerNo(player: Player): string {
  const digits = player.playerNo.replace(/\D/g, "");
  const n = Number(digits);
  if (digits && Number.isFinite(n) && n > 0) {
    return String(n).padStart(2, "0");
  }
  return "";
}

export type SoldPlayer = {
  player: Player;
  bid: number;
};

export type Team = {
  id: string;
  name: string;
  shortName: string;
  color: string;
  logo: string;
  points: number;
  players: (SoldPlayer | null)[];
};

export const TEAM_POINTS = 6000;
export const SLOT_COUNT = 15;
export const TEAM_COUNT = 5;
export const DEFAULT_BASE_PRICE = 100;
