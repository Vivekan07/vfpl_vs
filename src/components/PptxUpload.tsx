"use client";

import { useRef, useState } from "react";
import { useAuction } from "@/lib/auction-context";

export default function PptxUpload() {
  const { importPptx, loading } = useAuction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;

          setBusy(true);
          try {
            await importPptx(file);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        className="btn-upload"
        disabled={loading || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Importing…" : "Upload PPTX"}
      </button>
    </>
  );
}
