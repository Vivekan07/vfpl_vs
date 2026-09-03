import AuctionBoard from "@/components/AuctionBoard";
import ClientOnly from "@/components/ClientOnly";

export default function AuctionPage() {
  return (
    <ClientOnly
      fallback={
        <div className="auction">
          <p className="subtitle">Loading transfer window…</p>
        </div>
      }
    >
      <AuctionBoard />
    </ClientOnly>
  );
}
