"use client";

import LeagueLogo from "@/components/LeagueLogo";
import SiteNav from "@/components/SiteNav";
import TeamsGrid from "@/components/TeamsGrid";
import { SLOT_COUNT, TEAM_COUNT } from "@/lib/types";

export default function TeamsScreen() {
  return (
    <div className="auction teams-page">
      <div className="league-banner">
        <div className="league-badge">
          <LeagueLogo size={56} className="league-badge-img" />
        </div>
        <div className="league-banner-text">
          <p className="eyebrow">Valvai Football Premier League</p>
          <h1>Squad Boards</h1>
          <p className="subtitle">
            {TEAM_COUNT} clubs · {SLOT_COUNT} players per squad · live budgets
          </p>
        </div>
        <div className="header-actions">
          <SiteNav />
        </div>
      </div>

      <section className="teams">
        <TeamsGrid />
      </section>
    </div>
  );
}
