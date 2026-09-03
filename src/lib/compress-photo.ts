/** Shrink PPTX photos before they go into Postgres. */

const MAX_WIDTH = 480;
const MAX_HEIGHT = 640;
const WEBP_QUALITY = 68;
const SKIP_UNDER_BYTES = 28_000;

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function compressPhotoDataUrl(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return dataUrl;
  if (parsed.bytes.byteLength <= SKIP_UNDER_BYTES) return dataUrl;

  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(parsed.bytes)
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();

    if (out.byteLength >= parsed.bytes.byteLength) return dataUrl;
    return `data:image/webp;base64,${out.toString("base64")}`;
  } catch {
    return dataUrl;
  }
}
