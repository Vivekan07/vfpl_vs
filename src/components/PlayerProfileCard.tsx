import { displayPlayerNo, type Player } from "@/lib/types";
import { VFPL_LOGO } from "@/lib/brand";
import Image from "next/image";

type PlayerProfileCardProps = {
  player: Player;
};

export default function PlayerProfileCard({ player }: PlayerProfileCardProps) {
  return (
    <div className="profile-card">
      <header className="profile-card-header">
        <div className="profile-logo-wrap">
          <Image
            src={VFPL_LOGO}
            alt="Valvai Football Premier League"
            width={72}
            height={72}
            className="profile-logo"
          />
        </div>

        <div className="profile-title-block">
          <p className="profile-league-name">VALVAI FOOTBALL PREMIER LEAGUE</p>
          <div className="profile-title-rule" />
          <p className="profile-title">VMPL • PLAYER PROFILE</p>
        </div>

        <div className="profile-number-badge">
          <span className="profile-number-label">PLAYER NO.</span>
          <strong className="profile-number-value">
            {displayPlayerNo(player) || "—"}
          </strong>
        </div>
      </header>

      <div className="profile-card-body">
        <div className="profile-photo-panel">
          {player.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photo}
              alt={player.name}
              className="profile-photo"
            />
          ) : (
            <div className="profile-photo-empty">
              <span>⚽</span>
              <p>No photo</p>
            </div>
          )}
        </div>

        <div className="profile-details-panel">
          <p className="profile-details-title">PLAYER DETAILS</p>

          <div className="profile-field">
            <span className="profile-field-label">PLAYER NAME</span>
            <strong className="profile-field-value">
              {player.name.toUpperCase()}
            </strong>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">POSITION</span>
            <strong className="profile-field-value">
              {player.role.toUpperCase()}
            </strong>
          </div>

          <div className="profile-field">
            <span className="profile-field-label">CONTACT NUMBER</span>
            <strong className="profile-field-value">
              {player.contact || "—"}
            </strong>
          </div>
        </div>
      </div>

      <footer className="profile-card-footer">
        <span>VALVAI FOOTBALL PREMIER LEAGUE • VMPL</span>
        <span>PREMIER LEAGUE</span>
      </footer>
    </div>
  );
}
