"use client";

import { filledSlots, useAuction } from "@/lib/auction-context";
import { VFPL_LOGO } from "@/lib/brand";
import { SLOT_COUNT } from "@/lib/types";

type TeamsGridProps = {
  selectable?: boolean;
};

export default function TeamsGrid({ selectable = false }: TeamsGridProps) {
  const { teams, selectedTeamId, setSelectedTeamId, history } = useAuction();

  const latestSale = history.find((item) => item.kind === "sale") ?? null;

  return (
    <div className="team-grid">
      {teams.map((team) => {
        const filled = filledSlots(team);
        return (
          <article
            key={team.id}
            className={`team-panel ${
              selectable && team.id === selectedTeamId ? "selected" : ""
            }`}
            style={{ ["--team" as string]: team.color }}
            onClick={
              selectable ? () => setSelectedTeamId(team.id) : undefined
            }
          >
            <header className="team-head">
              <div className="team-head-left">
                <div className="team-crest">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={team.logo || VFPL_LOGO} alt="" />
                </div>
                <div className="team-title">
                  <h4 className="team-short">{team.shortName}</h4>
                  <p className="team-full-name">{team.name}</p>
                </div>
              </div>
              <div className="team-stats">
                <p className="points">{team.points}</p>
                <p className="slots">
                  {filled}/{SLOT_COUNT} signed
                </p>
              </div>
            </header>

            <p className="squad-label">Squad · {SLOT_COUNT} slots</p>

            <div className="slots-grid">
              {team.players.map((slot, index) => {
                const isLatest =
                  !!slot &&
                  !!latestSale &&
                  latestSale.playerId === slot.player.id &&
                  latestSale.teamId === team.id;

                return (
                  <div
                    key={`${team.id}-slot-${index}`}
                    className={`slot ${slot ? "filled" : "empty"} ${
                      isLatest ? "just-filled" : ""
                    }`}
                    title={
                      slot
                        ? `${slot.player.name} · ${slot.bid} pts`
                        : `Empty slot ${index + 1}`
                    }
                  >
                    {slot ? (
                      <>
                        <span className="slot-index">{index + 1}</span>
                        <span className="slot-name">{slot.player.name}</span>
                        <span className="slot-bid">{slot.bid}</span>
                      </>
                    ) : (
                      <span className="slot-placeholder">{index + 1}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
