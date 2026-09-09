"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import LeagueLogo from "@/components/LeagueLogo";
import PlayerProfileCard from "@/components/PlayerProfileCard";
import SiteNav from "@/components/SiteNav";
import { VFPL_LOGO } from "@/lib/brand";
import { LIVE_NOTICE, isLiveStatus, type LiveStatus } from "@/lib/auction-state";
import type { Player } from "@/lib/types";

const CURRENT_CHANNEL_NAME = "vfpl-current-player";
const META_POLL_MS = 1000;

type CurrentPayload = {
  playerId?: string | null;
  currentPlayerId?: string | null;
  player?: Player | null;
  liveStatus?: LiveStatus;
  liveMessage?: string;
  liveUpdatedAt?: number;
};

export default function LiveAuctionScreen() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("idle");
  const [liveMessage, setLiveMessage] = useState("");
  const metaStampRef = useRef("");
  const playerRef = useRef<Player | null>(null);
  const liveAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let applyGen = 0;

    const applyMeta = async (next: CurrentPayload) => {
      if (cancelled) return;
      const gen = ++applyGen;
      const at = typeof next.liveUpdatedAt === "number" ? next.liveUpdatedAt : 0;
      if (at && at < liveAtRef.current) return;
      if (at) liveAtRef.current = at;

      const id =
        next.playerId ?? next.currentPlayerId ?? next.player?.id ?? null;
      const status: LiveStatus = isLiveStatus(next.liveStatus)
        ? next.liveStatus
        : id
          ? "player"
          : "idle";
      const message = next.liveMessage ?? "";
      const stamp = `${id ?? ""}|${status}|${message}`;

      setLiveStatus(status);
      setLiveMessage(message);

      if (status !== "player") {
        metaStampRef.current = stamp;
        playerRef.current = null;
        setPlayer(null);
        return;
      }

      if (next.player?.photo) {
        metaStampRef.current = stamp;
        playerRef.current = next.player;
        setPlayer(next.player);
        return;
      }

      if (
        stamp === metaStampRef.current &&
        playerRef.current?.id === id &&
        playerRef.current.photo
      ) {
        return;
      }

      metaStampRef.current = stamp;
      const res = await fetch("/api/auction/current", { cache: "no-store" });
      if (!res.ok || cancelled || gen !== applyGen) return;
      const full = (await res.json()) as CurrentPayload;
      if (cancelled || gen !== applyGen) return;
      if (full.liveStatus && full.liveStatus !== "player") return;
      if (full.player) {
        playerRef.current = full.player;
        setPlayer(full.player);
      }
    };

    const pullMeta = async () => {
      try {
        const res = await fetch("/api/auction/current?meta=1", {
          cache: "no-store",
        });
        if (!res.ok) return;
        await applyMeta((await res.json()) as CurrentPayload);
      } catch {
        // ignore — next poll retries
      }
    };

    void pullMeta();
    const timer = window.setInterval(pullMeta, META_POLL_MS);

    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(CURRENT_CHANNEL_NAME)
        : null;
    const onMessage = (event: MessageEvent<CurrentPayload>) => {
      void applyMeta(event.data);
    };
    channel?.addEventListener("message", onMessage);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, []);

  const showingPlayer = liveStatus === "player" && player;
  const notice = showingPlayer
    ? null
    : LIVE_NOTICE[liveStatus === "player" ? "idle" : liveStatus];
  const noticeSubtitle = (liveMessage || notice?.message || "").trim();
  const showNoticeSubtitle =
    !!notice &&
    !!noticeSubtitle &&
    noticeSubtitle.toLowerCase() !== notice.title.toLowerCase();

  return (
    <div className="auction live-auction-page">
      <div className="league-banner live-auction-banner">
        <div className="league-badge">
          <LeagueLogo size={56} className="league-badge-img" />
        </div>
        <div className="league-banner-text">
          <p className="eyebrow">Valvai Football Premier League</p>
          <h1>Live Auction</h1>
          <p className="subtitle">Current player on the block</p>
        </div>
        <div className="header-actions">
          <SiteNav />
        </div>
      </div>

      <section className="live-auction-stage">
        {notice ? (
          <div
            key={liveStatus === "player" ? "idle" : liveStatus}
            className={`live-notice-board live-notice-${
              liveStatus === "player" ? "idle" : liveStatus
            }`}
          >
            <div className="live-notice-crest">
              <Image
                src={VFPL_LOGO}
                alt="Valvai Football Premier League"
                width={480}
                height={480}
                className="live-notice-logo"
                priority
              />
            </div>
            <p className="live-notice-kicker">VMPL • PLAYER AUCTION</p>
            <h2>{notice.title}</h2>
            {showNoticeSubtitle ? (
              <p className="live-notice-message">{noticeSubtitle}</p>
            ) : null}
          </div>
        ) : (
          <div key={player!.id} className="live-auction-card">
            <PlayerProfileCard player={player!} />
          </div>
        )}
      </section>
    </div>
  );
}
