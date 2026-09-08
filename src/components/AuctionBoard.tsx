"use client";

import { useMemo, useState } from "react";
import LeagueLogo from "@/components/LeagueLogo";
import PlayerProfileCard from "@/components/PlayerProfileCard";
import PptxUpload from "@/components/PptxUpload";
import SiteNav from "@/components/SiteNav";
import { filledSlots, useAuction } from "@/lib/auction-context";
import { displayPlayerNo, SLOT_COUNT, TEAM_COUNT, type Player } from "@/lib/types";

function matchesSearch(player: Player, query: string) {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  return (
    player.name.toLowerCase().includes(q) ||
    player.role.toLowerCase().includes(q) ||
    player.playerNo.toLowerCase().includes(q)
  );
}

export default function AuctionBoard() {
  const {
    teams,
    pool,
    unsold,
    history,
    selectedPlayerId,
    selectedTeamId,
    bid,
    message,
    selectedPlayer,
    setSelectedTeamId,
    setBid,
    selectPlayer,
    cancelPlayer,
    setLiveNotice,
    buyPlayer,
    markUnsold,
    reSellPlayer,
    resetAuction,
    clearPlayers,
    undoSale,
  } = useAuction();

  const [search, setSearch] = useState("");

  const filteredPool = useMemo(
    () => pool.filter((player) => matchesSearch(player, search)),
    [pool, search],
  );

  const filteredUnsold = useMemo(
    () => unsold.filter((player) => matchesSearch(player, search)),
    [unsold, search],
  );

  return (
    <div className="auction">
      <div className="league-banner">
        <div className="league-badge">
          <LeagueLogo size={56} className="league-badge-img" />
        </div>
        <div className="league-banner-text">
          <p className="eyebrow">Valvai Football Premier League</p>
          <h1>VFPL Transfer Window</h1>
          <p className="subtitle">
            {TEAM_COUNT} clubs · {SLOT_COUNT} squad slots · upload player PPTX
            to save the pool in the database
          </p>
        </div>
        <div className="header-actions">
          <PptxUpload />
          <SiteNav />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const ok = window.confirm(
                "Reset auction only? Signings, unsold, budgets, and history clear. Players stay in the database.",
              );
              if (ok) void resetAuction();
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="btn-danger-ghost"
            onClick={() => {
              const ok = window.confirm(
                "Clear the player database? This deletes every stored player (name, position, phone, photo) and resets the auction. Upload a PPTX again to reload.",
              );
              if (ok) void clearPlayers();
            }}
          >
            Clear players
          </button>
        </div>
      </div>

      <section className="desk">
        <div className="desk-main">
          {selectedPlayer ? (
            <PlayerProfileCard player={selectedPlayer} />
          ) : null}

          <div className="desk-main-inner">
            <div className="controls">
              <label>
                Team
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.points} pts · {filledSlots(team)}/
                      {SLOT_COUNT})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Bid (points)
                <input
                  type="number"
                  min={100}
                  value={bid}
                  onChange={(e) => setBid(Number(e.target.value))}
                  disabled={!selectedPlayer}
                />
              </label>

              <div className="control-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={buyPlayer}
                  disabled={!selectedPlayer}
                >
                  Sign player
                </button>
                <button
                  type="button"
                  className="btn-unsold"
                  onClick={markUnsold}
                  disabled={!selectedPlayer}
                >
                  Unsold
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={cancelPlayer}
                >
                  Cancel
                </button>
              </div>
              <div className="live-notice-actions">
                <button
                  type="button"
                  className="btn-break"
                  onClick={() => setLiveNotice("break")}
                >
                  Auction break
                </button>
                <button
                  type="button"
                  className="btn-wait"
                  onClick={() => setLiveNotice("wait")}
                >
                  Wait a moment
                </button>
              </div>
            </div>

            {message ? <p className="toast">{message}</p> : null}

            <div className="history">
              <p className="label">Transfer feed</p>
              {history.length > 0 ? (
                <ul>
                  {history.map((item) => {
                    const canUndo =
                      item.kind === "sale" ||
                      item.text.includes("signed to") ||
                      item.text.includes("→");
                    return (
                      <li key={item.id} className="history-item">
                        <span>{item.text}</span>
                        {canUndo ? (
                          <button
                            type="button"
                            className="btn-undo"
                            onClick={() => undoSale(item.id)}
                          >
                            Undo
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty history-empty">No signings yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="side-panels">
          <div className="player-search">
            <label>
              Search player
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, position…"
                autoComplete="off"
              />
            </label>
          </div>

          <aside className="pool">
            <div className="panel-head">
              <p className="label">Available pool</p>
              <span className="count-badge">{filteredPool.length}</span>
            </div>
            <div className="pool-list">
              {filteredPool.map((player: Player) => {
                const playerNo = displayPlayerNo(player);
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`pool-item ${
                      player.id === selectedPlayerId ? "active" : ""
                    }`}
                    onClick={() => selectPlayer(player)}
                  >
                    <span className="pool-identity">
                      {playerNo ? (
                        <span className="pool-no">{playerNo}</span>
                      ) : null}
                      <span className="pool-name">{player.name}</span>
                    </span>
                    {player.role ? (
                      <span className="pool-meta">{player.role}</span>
                    ) : null}
                  </button>
                );
              })}
              {pool.length === 0 ? (
                <p className="empty">
                  No players yet. Upload a player profile PPTX to save them in
                  the database.
                </p>
              ) : filteredPool.length === 0 ? (
                <p className="empty">No player matches “{search.trim()}”.</p>
              ) : null}
            </div>
          </aside>

          <aside className="pool unsold-panel">
            <div className="panel-head">
              <p className="label">Unsold</p>
              <span className="count-badge muted">{filteredUnsold.length}</span>
            </div>
            <div className="pool-list">
              {filteredUnsold.map((player: Player) => {
                const playerNo = displayPlayerNo(player);
                return (
                  <div key={player.id} className="unsold-item">
                    <span className="pool-identity">
                      {playerNo ? (
                        <span className="pool-no">{playerNo}</span>
                      ) : null}
                      <span className="pool-name">{player.name}</span>
                    </span>
                    <button
                      type="button"
                      className="btn-resell"
                      onClick={() => reSellPlayer(player.id)}
                    >
                      Re-list
                    </button>
                  </div>
                );
              })}
              {unsold.length === 0 ? (
                <p className="empty">No unsold players.</p>
              ) : filteredUnsold.length === 0 ? (
                <p className="empty">No unsold match.</p>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
