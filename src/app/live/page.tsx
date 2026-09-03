import ClientOnly from "@/components/ClientOnly";
import LiveAuctionScreen from "@/components/LiveAuctionScreen";

export default function LiveAuctionPage() {
  return (
    <ClientOnly
      fallback={
        <div className="auction">
          <p className="subtitle">Loading live auction…</p>
        </div>
      }
    >
      <LiveAuctionScreen />
    </ClientOnly>
  );
}
