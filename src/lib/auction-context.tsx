"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TEAM_DEFINITIONS,
  createInitialTeams,
} from "@/lib/data";
import { VFPL_LOGO } from "@/lib/brand";
import type { AuctionState, HistoryItem, LiveStatus } from "@/lib/auction-state";
import {
  LIVE_NOTICE,
  isLiveStatus,
  signedLiveMessage,
  unsoldLiveMessage,
} from "@/lib/auction-state";
import {
  DEFAULT_BASE_PRICE,
  SLOT_COUNT,
  type Player,
  type Team,
} from "@/lib/types";

const CHANNEL_NAME = "vfpl-auction-sync";
const CURRENT_CHANNEL_NAME = "vfpl-current-player";
const POLL_MS = 4000;

type AuctionContextValue = {
  teams: Team[];
  pool: Player[];
  unsold: Player[];
  history: HistoryItem[];
  selectedPlayerId: string | null;
  selectedTeamId: string;
  bid: number;
  message: string;
  loading: boolean;
  selectedPlayer: Player | null;
  selectedTeam: Team | null;
  setSelectedTeamId: (id: string) => void;
  setBid: (value: number) => void;
  selectPlayer: (player: Player) => void;
  cancelPlayer: () => void;
  setLiveNotice: (status: Extract<LiveStatus, "break" | "wait">) => void;
  buyPlayer: () => void;
  markUnsold: () => void;
  reSellPlayer: (playerId: string) => void;
  undoSale: (historyId: string) => void;
  resetAuction: () => void;
  clearPlayers: () => Promise<void>;
  importPptx: (file: File) => Promise<void>;
};

const AuctionContext = createContext<AuctionContextValue | null>(null);

function makeHistoryItem(
  text: string,
  extra?: Omit<HistoryItem, "id" | "text">,
): HistoryItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    ...extra,
  };
}

function normalizeHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: HistoryItem[] = [];
  raw.forEach((item, index) => {
    if (typeof item === "string") {
      items.push({ id: `legacy-${index}-${item}`, text: item });
      return;
    }
    if (
      item &&
      typeof item === "object" &&
      "text" in item &&
      typeof (item as HistoryItem).text === "string"
    ) {
      const typed = item as HistoryItem;
      items.push({
        id: typed.id || `legacy-${index}`,
        text: typed.text,
        kind: typed.kind,
        playerId: typed.playerId,
        teamId: typed.teamId,
        bid: typed.bid,
      });
    }
  });
  return items.slice(0, 12);
}

function initialState(): AuctionState {
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

function mergePlayerPhotos(incoming: Player[], existing: Player[]): Player[] {
  if (existing.length === 0) return incoming;
  const photos = new Map(existing.map((player) => [player.id, player.photo]));
  return incoming.map((player) => {
    const kept = photos.get(player.id);
    if (player.photo || !kept) return player;
    return { ...player, photo: kept };
  });
}

function normalizePlayer(
  raw: Partial<Player> & { id?: string; name?: string },
): Player | null {
  if (!raw?.id || !raw?.name) return null;
  return {
    id: raw.id,
    name: raw.name,
    role: String(raw.role ?? "Footballer"),
    playerNo: String(raw.playerNo ?? ""),
    contact: String(raw.contact ?? ""),
    designation: String(raw.designation ?? ""),
    photo: String(raw.photo ?? ""),
    basePrice: Number(raw.basePrice) || DEFAULT_BASE_PRICE,
  };
}

function normalizePlayers(raw: unknown): Player[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizePlayer(item as Partial<Player>))
    .filter((p): p is Player => p !== null);
}

function normalizeTeamSlots(teams: Team[]): Team[] {
  return teams.map((team, index) => {
    const def =
      TEAM_DEFINITIONS.find((item) => item.id === team.id) ??
      TEAM_DEFINITIONS[index];
    const players = team.players
      .slice(0, SLOT_COUNT)
      .map((slot) => {
        if (!slot) return null;
        const player = normalizePlayer(slot.player);
        if (!player) return null;
        return { player, bid: slot.bid };
      });
    while (players.length < SLOT_COUNT) players.push(null);
    return {
      ...team,
      name: def?.name ?? team.name,
      shortName: def?.shortName ?? team.shortName,
      color: def?.color ?? team.color,
      logo: def?.logo ?? team.logo ?? VFPL_LOGO,
      players,
    };
  });
}

function normalizeState(raw: Partial<AuctionState> | null): AuctionState | null {
  if (!raw?.teams || !Array.isArray(raw.pool)) return null;
  return {
    teams: normalizeTeamSlots(raw.teams),
    pool: normalizePlayers(raw.pool),
    unsold: normalizePlayers(raw.unsold ?? []),
    history: normalizeHistory(raw.history ?? []),
    currentPlayerId:
      typeof raw.currentPlayerId === "string" ? raw.currentPlayerId : null,
    liveStatus: isLiveStatus(raw.liveStatus) ? raw.liveStatus : "idle",
    liveMessage: String(raw.liveMessage ?? ""),
    liveSeq: typeof raw.liveSeq === "number" ? raw.liveSeq : undefined,
  };
}

function stateFingerprint(state: AuctionState): string {
  return JSON.stringify({
    teams: state.teams.map((t) => ({
      id: t.id,
      points: t.points,
      players: t.players.map((s) =>
        s ? { id: s.player.id, bid: s.bid } : null,
      ),
    })),
    pool: state.pool.map((p) => p.id),
    unsold: state.unsold.map((p) => p.id),
    history: state.history.map((h) => h.id),
    currentPlayerId: state.currentPlayerId ?? null,
    liveStatus: state.liveStatus ?? "idle",
    liveMessage: state.liveMessage ?? "",
  });
}

async function fetchAuctionState(lean = false): Promise<AuctionState | null> {
  const res = await fetch(lean ? "/api/auction?lean=1" : "/api/auction", {
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Load failed (${res.status})`);
  }
  return normalizeState((await res.json()) as Partial<AuctionState>);
}

async function putAuctionState(state: AuctionState): Promise<AuctionState | null> {
  const res = await fetch("/api/auction", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...state,
      pool: state.pool.map((player) => ({ ...player, photo: "" })),
      unsold: state.unsold.map((player) => ({ ...player, photo: "" })),
      teams: state.teams.map((team) => ({
        ...team,
        players: team.players.map((slot) =>
          slot
            ? { ...slot, player: { ...slot.player, photo: "" } }
            : null,
        ),
      })),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Save failed (${res.status})`);
  }
  return normalizeState((await res.json()) as Partial<AuctionState>);
}

async function postResetAuction(): Promise<AuctionState | null> {
  const res = await fetch("/api/auction/reset", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Reset failed (${res.status})`);
  }
  return normalizeState((await res.json()) as Partial<AuctionState>);
}

async function postClearPlayers(): Promise<AuctionState | null> {
  const res = await fetch("/api/players/clear", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Clear players failed (${res.status})`);
  }
  return normalizeState((await res.json()) as Partial<AuctionState>);
}

export function AuctionProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>(() => createInitialTeams());
  const [pool, setPool] = useState<Player[]>([]);
  const [unsold, setUnsold] = useState<Player[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState(
    createInitialTeams()[0]?.id ?? "",
  );
  const [bid, setBid] = useState(DEFAULT_BASE_PRICE);
  const [message, setMessage] = useState("");

  const channelRef = useRef<BroadcastChannel | null>(null);
  const currentChannelRef = useRef<BroadcastChannel | null>(null);
  const skipBroadcastRef = useRef(false);
  const fingerprintRef = useRef("");
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<AuctionState | null>(null);
  const saveEpochRef = useRef(0);
  const liveHoldRef = useRef<LiveStatus | null>(null);
  const localCurrentRef = useRef<string | null>(null);
  const liveSeqRef = useRef(0);
  const liveWriteChainRef = useRef(Promise.resolve());

  const waitForIdleSave = useCallback(async () => {
    let waited = 0;
    while (savingRef.current && waited < 15000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      waited += 50;
    }
  }, []);

  const waitForLiveWrites = useCallback(async () => {
    await liveWriteChainRef.current.catch(() => undefined);
  }, []);

  const applyState = useCallback((state: AuctionState, fromRemote = false) => {
    if (fromRemote) skipBroadcastRef.current = true;
    fingerprintRef.current = stateFingerprint(state);
    setTeams(state.teams);
    setPool((prev) => mergePlayerPhotos(state.pool, prev));
    setUnsold((prev) => mergePlayerPhotos(state.unsold, prev));
    setHistory(state.history);
    if (fromRemote) {
      const remoteId = state.currentPlayerId ?? null;
      const remoteLive = state.liveStatus ?? "idle";

      if (liveHoldRef.current === "idle") {
        setSelectedPlayerId(null);
        if (!remoteId) liveHoldRef.current = null;
      } else if (
        liveHoldRef.current === "break" ||
        liveHoldRef.current === "wait" ||
        liveHoldRef.current === "sold" ||
        liveHoldRef.current === "unsold"
      ) {
        if (remoteLive === "player" && remoteId) {
          liveHoldRef.current = "player";
          localCurrentRef.current = remoteId;
          setSelectedPlayerId(remoteId);
        }
      } else if (liveHoldRef.current && liveHoldRef.current !== remoteLive) {
        setSelectedPlayerId((current) => current);
      } else if (
        localCurrentRef.current &&
        localCurrentRef.current !== remoteId
      ) {
        setSelectedPlayerId(localCurrentRef.current);
      } else {
        localCurrentRef.current = remoteId;
        setSelectedPlayerId(remoteId);
        if (!remoteId) setBid(DEFAULT_BASE_PRICE);
      }
    } else {
      setSelectedPlayerId((current) => {
        if (current && state.pool.some((p) => p.id === current)) return current;
        setBid(DEFAULT_BASE_PRICE);
        return null;
      });
    }
  }, []);

  const persist = useCallback(
    async (state: AuctionState) => {
      const epoch = saveEpochRef.current;
      fingerprintRef.current = stateFingerprint(state);
      channelRef.current?.postMessage(state);

      if (savingRef.current) {
        pendingSaveRef.current = state;
        return;
      }

      savingRef.current = true;
      let next: AuctionState | null = state;
      try {
        while (next) {
          if (epoch !== saveEpochRef.current) break;

          const toSave = next;
          pendingSaveRef.current = null;
          const saved = await putAuctionState(toSave);
          if (epoch !== saveEpochRef.current) break;

          if (saved) {
            fingerprintRef.current = stateFingerprint(saved);
          }
          next = pendingSaveRef.current;
        }
      } catch (error) {
        console.error(error);
        setMessage(
          error instanceof Error ? error.message : "Could not save to database.",
        );
      } finally {
        savingRef.current = false;
        pendingSaveRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await fetchAuctionState();
        if (cancelled) return;
        if (loaded) {
          applyState(loaded, true);
          if (loaded.teams[0]) setSelectedTeamId(loaded.teams[0].id);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not load auction from database.",
          );
          applyState(initialState(), true);
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
          setLoading(false);
        }
      }
    })();

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;
    channelRef.current = channel;

    const onMessage = (event: MessageEvent<AuctionState>) => {
      const next = normalizeState(event.data);
      if (!next) return;
      if (stateFingerprint(next) === fingerprintRef.current) return;
      applyState(next, true);
    };

    channel?.addEventListener("message", onMessage);

    const currentChannel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(CURRENT_CHANNEL_NAME)
        : null;
    currentChannelRef.current = currentChannel;

    const onCurrent = (
      event: MessageEvent<{ playerId?: string | null; player?: Player | null }>,
    ) => {
      const id = event.data?.playerId ?? null;
      localCurrentRef.current = id;
      setSelectedPlayerId(id);
      if (event.data?.player) {
        const incoming = event.data.player;
        setPool((prev) =>
          prev.map((p) =>
            p.id === incoming.id
              ? { ...p, ...incoming, photo: incoming.photo || p.photo }
              : p,
          ),
        );
      }
    };
    currentChannel?.addEventListener("message", onCurrent);

    const poll = window.setInterval(async () => {
      // Avoid fighting an in-flight save (was causing lag after Buy).
      if (savingRef.current || pendingSaveRef.current || document.hidden) return;
      try {
        const remote = await fetchAuctionState(true);
        if (!remote) return;
        if (stateFingerprint(remote) === fingerprintRef.current) return;
        applyState(remote, true);
      } catch {
        // ignore poll errors
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      channelRef.current = null;
      currentChannel?.removeEventListener("message", onCurrent);
      currentChannel?.close();
      currentChannelRef.current = null;
      window.clearInterval(poll);
    };
  }, [applyState]);

  const selectedPlayer = useMemo(
    () => pool.find((p) => p.id === selectedPlayerId) ?? null,
    [pool, selectedPlayerId],
  );

  const selectedTeam = useMemo(
    () => teams.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );

  const enqueueLiveWrite = useCallback((task: () => Promise<void>) => {
    const run = liveWriteChainRef.current.then(task, task);
    liveWriteChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  const postLive = useCallback(
    (payload: {
      playerId: string | null;
      player?: Player | null;
      liveStatus: LiveStatus;
      liveMessage: string;
      liveUpdatedAt?: number;
    }) => {
      currentChannelRef.current?.postMessage({
        ...payload,
        liveUpdatedAt: payload.liveUpdatedAt ?? Date.now(),
      });
    },
    [],
  );

  const persistCurrentPlayer = useCallback(async (player: Player | null) => {
    const seq = ++liveSeqRef.current;
    const liveAt = Date.now();
    const playerId = player?.id ?? null;
    liveHoldRef.current = playerId ? "player" : "idle";
    localCurrentRef.current = playerId;
    postLive({
      playerId,
      player,
      liveStatus: playerId ? "player" : "idle",
      liveMessage: "",
      liveUpdatedAt: liveAt,
    });
    await enqueueLiveWrite(async () => {
      if (seq !== liveSeqRef.current) return;
      try {
        await fetch("/api/auction/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId,
            liveStatus: playerId ? "player" : "idle",
            liveMessage: "",
            liveSeq: liveAt,
          }),
        });
        if (seq !== liveSeqRef.current || !playerId) return;
        const full = await fetch("/api/auction/current", { cache: "no-store" });
        if (!full.ok || seq !== liveSeqRef.current) return;
        const data = (await full.json()) as { player?: Player | null };
        if (seq !== liveSeqRef.current || !data.player?.photo) return;
        setPool((prev) =>
          prev.map((item) =>
            item.id === data.player?.id
              ? { ...item, photo: data.player.photo }
              : item,
          ),
        );
        postLive({
          playerId,
          player: data.player,
          liveStatus: "player",
          liveMessage: "",
          liveUpdatedAt: liveAt,
        });
      } catch (error) {
        console.error(error);
      }
    });
  }, [enqueueLiveWrite, postLive]);

  const persistLiveNotice = useCallback(
    async (
      status: Extract<LiveStatus, "break" | "wait" | "sold" | "unsold">,
      message?: string,
    ) => {
      const seq = ++liveSeqRef.current;
      const liveAt = Date.now();
      const liveMessage = message ?? LIVE_NOTICE[status].message;
      liveHoldRef.current = status;
      localCurrentRef.current = null;
      postLive({
        playerId: null,
        player: null,
        liveStatus: status,
        liveMessage,
        liveUpdatedAt: liveAt,
      });
      await enqueueLiveWrite(async () => {
        if (seq !== liveSeqRef.current) return;
        try {
          await fetch("/api/auction/current", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              playerId: null,
              liveStatus: status,
              liveMessage,
              liveSeq: liveAt,
            }),
          });
        } catch (error) {
          console.error(error);
        }
      });
    },
    [enqueueLiveWrite, postLive],
  );

  const selectPlayer = useCallback(
    (player: Player) => {
      liveHoldRef.current = "player";
      localCurrentRef.current = player.id;
      setSelectedPlayerId(player.id);
      setBid(DEFAULT_BASE_PRICE);
      setMessage(`${player.name} is on the live auction block.`);
      void persistCurrentPlayer(player);
    },
    [persistCurrentPlayer],
  );

  const cancelPlayer = useCallback(() => {
    liveHoldRef.current = "idle";
    localCurrentRef.current = null;
    setSelectedPlayerId(null);
    setBid(DEFAULT_BASE_PRICE);
    setMessage("Cancelled — live auction is waiting for a player.");
    void persistCurrentPlayer(null);
  }, [persistCurrentPlayer]);

  const setLiveNotice = useCallback(
    (status: Extract<LiveStatus, "break" | "wait">) => {
      const notice = LIVE_NOTICE[status];
      setMessage(`Live auction: ${notice.title} — ${notice.message}`);
      void persistLiveNotice(status);
    },
    [persistLiveNotice],
  );

  const buyPlayer = useCallback(() => {
    if (!hydrated) return;
    if (!selectedPlayer || !selectedTeam) {
      setMessage("Select a player and a team first.");
      return;
    }

    const bidAmount = Math.floor(Number(bid));
    if (!Number.isFinite(bidAmount) || bidAmount < DEFAULT_BASE_PRICE) {
      setMessage(`Bid must be at least ${DEFAULT_BASE_PRICE} points.`);
      return;
    }

    if (bidAmount > selectedTeam.points) {
      setMessage(
        `${selectedTeam.name} only has ${selectedTeam.points} points left.`,
      );
      return;
    }

    const emptyIndex = selectedTeam.players.findIndex((slot) => slot === null);
    if (emptyIndex === -1) {
      setMessage(
        `${selectedTeam.name} already has all ${SLOT_COUNT} slots filled.`,
      );
      return;
    }

    const nextTeams = teams.map((team) => {
      if (team.id !== selectedTeam.id) return team;
      const players = [...team.players];
      players[emptyIndex] = { player: selectedPlayer, bid: bidAmount };
      return {
        ...team,
        points: team.points - bidAmount,
        players,
      };
    });

    const nextPool = pool.filter((p) => p.id !== selectedPlayer.id);
    const liveMessage = signedLiveMessage(
      selectedPlayer.name,
      selectedTeam.name,
      bidAmount,
    );
    const note = liveMessage;
    const nextHistory = [
      makeHistoryItem(note, {
        kind: "sale",
        playerId: selectedPlayer.id,
        teamId: selectedTeam.id,
        bid: bidAmount,
      }),
      ...history,
    ].slice(0, 12);
    const nextState: AuctionState = {
      teams: nextTeams,
      pool: nextPool,
      unsold,
      history: nextHistory,
      currentPlayerId: null,
      liveStatus: "sold",
      liveMessage,
      liveSeq: 0,
    };

    const seq = ++liveSeqRef.current;
    const liveAt = Date.now();
    nextState.liveSeq = liveAt;
    liveHoldRef.current = "sold";
    localCurrentRef.current = null;
    setTeams(nextTeams);
    setPool(nextPool);
    setHistory(nextHistory);
    setSelectedPlayerId(null);
    setBid(DEFAULT_BASE_PRICE);
    setMessage(`Signed! ${note}`);
    postLive({
      playerId: null,
      player: null,
      liveStatus: "sold",
      liveMessage,
      liveUpdatedAt: liveAt,
    });
    void enqueueLiveWrite(async () => {
      if (seq !== liveSeqRef.current) return;
      try {
        await fetch("/api/auction/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: null,
            liveStatus: "sold",
            liveMessage,
            liveSeq: liveAt,
          }),
        });
      } catch (error) {
        console.error(error);
      }
      if (seq !== liveSeqRef.current) return;
      await persist(nextState);
    });
  }, [
    bid,
    enqueueLiveWrite,
    history,
    hydrated,
    persist,
    pool,
    postLive,
    selectedPlayer,
    selectedTeam,
    teams,
    unsold,
  ]);

  const markUnsold = useCallback(() => {
    if (!hydrated) return;
    if (!selectedPlayer) {
      setMessage("Select a player first.");
      return;
    }

    const nextPool = pool.filter((p) => p.id !== selectedPlayer.id);
    const nextUnsold = [
      selectedPlayer,
      ...unsold.filter((p) => p.id !== selectedPlayer.id),
    ];
    const liveMessage = unsoldLiveMessage(selectedPlayer.name);
    const note = liveMessage;
    const nextHistory = [
      makeHistoryItem(note, { kind: "unsold", playerId: selectedPlayer.id }),
      ...history,
    ].slice(0, 12);
    const nextState: AuctionState = {
      teams,
      pool: nextPool,
      unsold: nextUnsold,
      history: nextHistory,
      currentPlayerId: null,
      liveStatus: "unsold",
      liveMessage,
      liveSeq: 0,
    };

    const seq = ++liveSeqRef.current;
    const liveAt = Date.now();
    nextState.liveSeq = liveAt;
    liveHoldRef.current = "unsold";
    localCurrentRef.current = null;
    setPool(nextPool);
    setUnsold(nextUnsold);
    setHistory(nextHistory);
    setSelectedPlayerId(null);
    setBid(DEFAULT_BASE_PRICE);
    setMessage(note);
    postLive({
      playerId: null,
      player: null,
      liveStatus: "unsold",
      liveMessage,
      liveUpdatedAt: liveAt,
    });
    void enqueueLiveWrite(async () => {
      if (seq !== liveSeqRef.current) return;
      try {
        await fetch("/api/auction/current", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: null,
            liveStatus: "unsold",
            liveMessage,
            liveSeq: liveAt,
          }),
        });
      } catch (error) {
        console.error(error);
      }
      if (seq !== liveSeqRef.current) return;
      await persist(nextState);
    });
  }, [
    enqueueLiveWrite,
    history,
    hydrated,
    persist,
    pool,
    postLive,
    selectedPlayer,
    teams,
    unsold,
  ]);

  const reSellPlayer = useCallback(
    (playerId: string) => {
      if (!hydrated) return;
      const player = unsold.find((p) => p.id === playerId);
      if (!player) return;

      const nextUnsold = unsold.filter((p) => p.id !== playerId);
      const nextPool = [player, ...pool.filter((p) => p.id !== playerId)];
      const note = `${player.name} back for re-sale`;
      const nextHistory = [
        makeHistoryItem(note, { kind: "resell", playerId: player.id }),
        ...history,
      ].slice(0, 12);
      const nextState: AuctionState = {
        teams,
        pool: nextPool,
        unsold: nextUnsold,
        history: nextHistory,
        currentPlayerId: player.id,
        liveStatus: "player",
        liveMessage: "",
      };

      setUnsold(nextUnsold);
      setPool(nextPool);
      setHistory(nextHistory);
      setSelectedPlayerId(player.id);
      setBid(DEFAULT_BASE_PRICE);
      setMessage(note);
      void persistCurrentPlayer(player);
      void persist(nextState);
    },
    [history, hydrated, persist, persistCurrentPlayer, pool, teams, unsold],
  );

  const undoSale = useCallback(
    (historyId: string) => {
      if (!hydrated) return;
      const item = history.find((entry) => entry.id === historyId);
      if (!item) return;

      let teamId = item.teamId;
      let playerId = item.playerId;
      let bidAmount = item.bid;

      if (!teamId || !playerId) {
        const signed = item.text.match(/^(.+?) signed to (\S+) · (\d+) pts$/);
        const legacy = item.text.match(/^(.+?) → (\S+) for (\d+) pts$/);
        const match = signed ?? legacy;
        if (!match) {
          setMessage("Only signed players can be returned to the pool.");
          return;
        }
        const [, playerName, shortName, bidText] = match;
        const team = teams.find((t) => t.shortName === shortName);
        const slot = team?.players.find(
          (s) => s && s.player.name === playerName,
        );
        if (!team || !slot) {
          setMessage("That sale is no longer on a team roster.");
          return;
        }
        teamId = team.id;
        playerId = slot.player.id;
        bidAmount = slot.bid;
      }

      const team = teams.find((t) => t.id === teamId);
      if (!team) {
        setMessage("Team not found for that sale.");
        return;
      }

      const slotIndex = team.players.findIndex(
        (slot) => slot?.player.id === playerId,
      );
      if (slotIndex === -1) {
        setMessage("Player is not on that team anymore.");
        return;
      }

      const sold = team.players[slotIndex];
      if (!sold) return;
      const refund = Number.isFinite(bidAmount) ? Number(bidAmount) : sold.bid;

      const nextTeams = teams.map((t) => {
        if (t.id !== teamId) return t;
        const players = [...t.players];
        players[slotIndex] = null;
        return {
          ...t,
          points: t.points + refund,
          players,
        };
      });

      const nextPool = [
        sold.player,
        ...pool.filter((p) => p.id !== sold.player.id),
      ];
      const nextUnsold = unsold.filter((p) => p.id !== sold.player.id);
      const note = `${sold.player.name} returned to available`;
      const nextHistory = [
        makeHistoryItem(note, { kind: "resell", playerId: sold.player.id }),
        ...history.filter((entry) => entry.id !== historyId),
      ].slice(0, 12);

      const nextState: AuctionState = {
        teams: nextTeams,
        pool: nextPool,
        unsold: nextUnsold,
        history: nextHistory,
        currentPlayerId: sold.player.id,
        liveStatus: "player",
        liveMessage: "",
      };

      setTeams(nextTeams);
      setPool(nextPool);
      setUnsold(nextUnsold);
      setHistory(nextHistory);
      setSelectedPlayerId(sold.player.id);
      setBid(DEFAULT_BASE_PRICE);
      setMessage(note);
      void persistCurrentPlayer(sold.player);
      void persist(nextState);
    },
    [history, hydrated, persist, persistCurrentPlayer, pool, teams, unsold],
  );

  const resetAuction = useCallback(async () => {
    try {
      const liveAt = Date.now();
      liveSeqRef.current += 1;
      liveHoldRef.current = "idle";
      localCurrentRef.current = null;
      postLive({
        playerId: null,
        player: null,
        liveStatus: "idle",
        liveMessage: "",
        liveUpdatedAt: liveAt,
      });

      saveEpochRef.current += 1;
      pendingSaveRef.current = null;
      await waitForLiveWrites();
      await waitForIdleSave();
      saveEpochRef.current += 1;
      pendingSaveRef.current = null;

      setMessage("Resetting…");
      const next = await postResetAuction();
      if (!next) throw new Error("Reset returned empty state");
      applyState(next, true);
      setSelectedPlayerId(null);
      setSelectedTeamId(next.teams[0]?.id ?? "");
      setBid(DEFAULT_BASE_PRICE);
      setUnsold([]);
      setHistory([]);
      setMessage(
        "Auction reset — squads cleared, budgets restored. Players stay in the database.",
      );
      channelRef.current?.postMessage(next);
      postLive({
        playerId: null,
        player: null,
        liveStatus: "idle",
        liveMessage: "",
        liveUpdatedAt: next.liveSeq ?? liveAt,
      });
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "Could not reset auction.",
      );
    }
  }, [applyState, postLive, waitForIdleSave, waitForLiveWrites]);

  const clearPlayers = useCallback(async () => {
    try {
      saveEpochRef.current += 1;
      pendingSaveRef.current = null;
      await waitForLiveWrites();
      await waitForIdleSave();
      saveEpochRef.current += 1;
      pendingSaveRef.current = null;

      setMessage("Clearing player database…");
      const next = await postClearPlayers();
      if (!next) throw new Error("Clear returned empty state");
      applyState(next, true);
      setSelectedPlayerId(null);
      setSelectedTeamId(next.teams[0]?.id ?? "");
      setBid(DEFAULT_BASE_PRICE);
      setMessage(
        "Player database cleared. Upload a PPTX to load players again.",
      );
      channelRef.current?.postMessage(next);
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not clear player database.",
      );
    }
  }, [applyState, waitForIdleSave, waitForLiveWrites]);

  const importPptx = useCallback(
    async (file: File) => {
      try {
        setMessage("Importing players from PPTX into the database…");
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/players/import", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Import failed (${res.status})`);
        }
        const raw = (await res.json()) as Partial<AuctionState> & {
          imported?: number;
        };
        const next = normalizeState(raw);
        if (!next) throw new Error("Import returned empty state");
        applyState(next, true);
        setSelectedPlayerId(null);
        setSelectedTeamId(next.teams[0]?.id ?? "");
        setBid(DEFAULT_BASE_PRICE);
        setMessage(
          `Saved ${raw.imported ?? next.pool.length} players to the database from PPTX.`,
        );
        channelRef.current?.postMessage(next);
      } catch (error) {
        console.error(error);
        setMessage(
          error instanceof Error ? error.message : "Could not import PPTX.",
        );
      }
    },
    [applyState],
  );

  const value: AuctionContextValue = {
    teams,
    pool,
    unsold,
    history,
    selectedPlayerId,
    selectedTeamId,
    bid,
    message,
    loading,
    selectedPlayer,
    selectedTeam,
    setSelectedTeamId,
    setBid,
    selectPlayer,
    cancelPlayer,
    setLiveNotice,
    buyPlayer,
    markUnsold,
    reSellPlayer,
    undoSale,
    resetAuction,
    clearPlayers,
    importPptx,
  };

  return (
    <AuctionContext.Provider value={value}>{children}</AuctionContext.Provider>
  );
}

export function useAuction() {
  const ctx = useContext(AuctionContext);
  if (!ctx) {
    throw new Error("useAuction must be used inside AuctionProvider");
  }
  return ctx;
}

export function filledSlots(team: Team) {
  return team.players.filter(Boolean).length;
}
