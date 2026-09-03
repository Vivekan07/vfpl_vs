"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav">
      <Link href="/live" className={pathname === "/live" ? "active" : ""}>
        Live Auction
      </Link>
      <Link href="/teams" className={pathname === "/teams" ? "active" : ""}>
        Squads
      </Link>
    </nav>
  );
}
