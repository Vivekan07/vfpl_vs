import ClientOnly from "@/components/ClientOnly";
import TeamsScreen from "@/components/TeamsScreen";

export default function TeamsPage() {
  return (
    <ClientOnly
      fallback={
        <div className="auction">
          <p className="subtitle">Loading squads…</p>
        </div>
      }
    >
      <TeamsScreen />
    </ClientOnly>
  );
}
