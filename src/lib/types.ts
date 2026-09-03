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
