import Image from "next/image";
import { VFPL_LOGO } from "@/lib/brand";

type LeagueLogoProps = {
  size?: number;
  className?: string;
};

export default function LeagueLogo({
  size = 72,
  className,
}: LeagueLogoProps) {
  return (
    <Image
      src={VFPL_LOGO}
      alt="Valvai Football Premier League"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}
