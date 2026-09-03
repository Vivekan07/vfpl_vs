import JSZip from "jszip";

export type ParsedPptxPlayer = {
  name: string;
  role: string;
  contact: string;
  playerNo: string;
  photo: string;
};

const LABELS = {
  playerNo: ["PLAYER NO.", "PLAYER NO", "PLAYER NUMBER", "PLAYER NUM"],
  name: ["PLAYER NAME", "NAME"],
  role: ["POSITION", "POS"],
  contact: [
    "CONTACT NUMBER",
    "CONTACT NO.",
    "CONTACT NO",
    "CONTACT",
    "PHONE NUMBER",
    "PHONE NO.",
    "PHONE",
  ],
} as const;

const SKIP_TEXT = new Set([
  "VALVAI FOOTBALL PREMIER LEAGUE",
  "VALVAI FOOTBALL PREMIER LEAGUE • VMPL",
  "VALVAI FOOTBALL PREMIER LEAGUE - VFPL",
  "VALVAI FOOTBALL PREMIER LEAGUE - VMPL",
  "VMPL",
  "VFPL",
  "PLAYER PROFILE",
  "PLAYER DETAILS",
  "PREMIER LEAGUE",
  "VMPL • PLAYER PROFILE",
  "VFPL • PLAYER PROFILE",
]);

/** Skip tiny embeds (icons). Player portraits and crest are usually larger. */
const MIN_PHOTO_BYTES = 2_000;

/** Standard 16:9 slide width in EMUs — used to detect header logos vs photo panel. */
const SLIDE_WIDTH_EMU = 12_192_000;
const SLIDE_HEIGHT_EMU = 6_858_000;

function decodeXml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSlideTexts(slideXml: string): string[] {
  const texts: string[] = [];
  const re = /<a:t(?:[^>]*)>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slideXml)) !== null) {
    const value = decodeXml(match[1] ?? "");
    if (value) texts.push(value);
  }
  return texts;
}

function isLabel(text: string): boolean {
  const upper = text.toUpperCase().trim();
  if (SKIP_TEXT.has(upper)) return true;
  if (Object.values(LABELS).some((labels) => labels.some((l) => l === upper))) {
    return true;
  }
  // "PLAYER NO. 70" still counts as a label line for skip purposes of other fields
  if (/^PLAYER\s*NO\.?\s*\d{1,3}$/i.test(upper)) return true;
  return false;
}

function findLabelKey(text: string): keyof typeof LABELS | null {
  const upper = text.toUpperCase().trim();
  for (const [key, labels] of Object.entries(LABELS) as [
    keyof typeof LABELS,
    readonly string[],
  ][]) {
    if (labels.some((label) => label === upper)) return key;
  }
  return null;
}

function isPlayerNoValue(text: string): boolean {
  return /^\d{1,3}$/.test(text.trim());
}

function isPhoneLike(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7;
}

function extractInlinePlayerNo(text: string): string | null {
  const match = text
    .toUpperCase()
    .trim()
    .match(/^PLAYER\s*NO\.?\s*[:\-]?\s*(\d{1,3})$/);
  return match?.[1] ?? null;
}

function parseSlideFields(texts: string[]): Omit<ParsedPptxPlayer, "photo"> {
  const fields = {
    playerNo: "",
    name: "",
    role: "",
    contact: "",
  };

  for (let i = 0; i < texts.length; i++) {
    const raw = texts[i] ?? "";

    const inlineNo = extractInlinePlayerNo(raw);
    if (inlineNo && !fields.playerNo) {
      fields.playerNo = inlineNo;
      continue;
    }

    const key = findLabelKey(raw);
    if (!key) continue;

    for (let j = i + 1; j < texts.length; j++) {
      const candidate = (texts[j] ?? "").trim();
      if (!candidate || isLabel(candidate)) continue;

      if (key === "playerNo") {
        if (isPlayerNoValue(candidate)) {
          fields.playerNo = candidate;
          break;
        }
        // Keep scanning until a 1–3 digit value (skip titles / names)
        continue;
      }

      if (key === "contact") {
        fields.contact = candidate;
        break;
      }

      if (key === "name" && isPlayerNoValue(candidate)) continue;
      if (key === "role" && isPhoneLike(candidate)) continue;

      fields[key] = candidate;
      break;
    }
  }

  // Fallback: number sitting right after a PLAYER NO label in the flat text stream
  if (!fields.playerNo) {
    for (let i = 0; i < texts.length; i++) {
      const key = findLabelKey(texts[i] ?? "");
      if (key !== "playerNo") continue;
      for (let j = i + 1; j < Math.min(i + 6, texts.length); j++) {
        const candidate = (texts[j] ?? "").trim();
        if (isPlayerNoValue(candidate)) {
          fields.playerNo = candidate;
          break;
        }
      }
      if (fields.playerNo) break;
    }
  }

  // Last resort: first standalone 1–3 digit token that is not part of a phone
  if (!fields.playerNo) {
    for (const text of texts) {
      const t = text.trim();
      if (isPhoneLike(t)) continue;
      if (isPlayerNoValue(t) && Number(t) > 0) {
        fields.playerNo = t;
        break;
      }
    }
  }

  return fields;
}

function mimeForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".emf") || lower.endsWith(".wmf")) {
    return "application/octet-stream";
  }
  return "application/octet-stream";
}

function resolveMediaTarget(target: string): string {
  let cleaned = target.replace(/\\/g, "/").replace(/^\.\.\//, "ppt/");
  if (cleaned.startsWith("/")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("media/")) cleaned = `ppt/${cleaned}`;
  if (!cleaned.startsWith("ppt/")) cleaned = `ppt/slides/${cleaned}`;
  return cleaned;
}

function lookupEmbedTarget(relsXml: string, embedId: string): string | null {
  const relMatch =
    relsXml.match(
      new RegExp(`Id="${embedId}"[^>]*Target="([^"]+)"`, "i"),
    ) ??
    relsXml.match(
      new RegExp(`Target="([^"]+)"[^>]*Id="${embedId}"`, "i"),
    );
  return relMatch?.[1] ?? null;
}

type PicCandidate = {
  embedId: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  area: number;
};

/**
 * Collect every <p:pic> (and blip fill) with on-slide position/size.
 * The VFPL crest sits small in the header; the player photo is the large
 * portrait frame under it on the left — pick by geometry, not file bytes.
 */
function collectSlidePictures(slideXml: string): PicCandidate[] {
  const pics: PicCandidate[] = [];

  const picBlocks = [
    ...slideXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/gi),
    ...slideXml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gi),
  ];

  for (const blockMatch of picBlocks) {
    const block = blockMatch[0] ?? "";
    const embed =
      block.match(/r:embed="([^"]+)"/i)?.[1] ??
      block.match(/r:link="([^"]+)"/i)?.[1];
    if (!embed) continue;

    // Prefer xfrm closest to the blip (picture frame), not a random shape xfrm
    const blipSection =
      block.match(
        /<(?:a:blip|p:blipFill|a:blipFill)\b[\s\S]{0,2500}?<a:xfrm\b[\s\S]*?<\/a:xfrm>/i,
      )?.[0] ?? block;

    const xfrm =
      blipSection.match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/i)?.[0] ??
      block.match(/<a:xfrm\b[\s\S]*?<\/a:xfrm>/i)?.[0] ??
      block.match(/<p:xfrm\b[\s\S]*?<\/p:xfrm>/i)?.[0];
    if (!xfrm) continue;

    const x = Number(xfrm.match(/<(?:a:)?off[^>]*\bx="(\d+)"/i)?.[1] ?? NaN);
    const y = Number(xfrm.match(/<(?:a:)?off[^>]*\by="(\d+)"/i)?.[1] ?? NaN);
    const cx = Number(xfrm.match(/<(?:a:)?ext[^>]*\bcx="(\d+)"/i)?.[1] ?? NaN);
    const cy = Number(xfrm.match(/<(?:a:)?ext[^>]*\bcy="(\d+)"/i)?.[1] ?? NaN);
    if (![x, y, cx, cy].every((n) => Number.isFinite(n) && n >= 0)) continue;
    if (cx < 50_000 || cy < 50_000) continue;

    pics.push({
      embedId: embed,
      x,
      y,
      cx,
      cy,
      area: cx * cy,
    });
  }

  // Deduplicate same embed id — keep the largest placed instance
  const byId = new Map<string, PicCandidate>();
  for (const pic of pics) {
    const prev = byId.get(pic.embedId);
    if (!prev || pic.area > prev.area) byId.set(pic.embedId, pic);
  }
  return [...byId.values()];
}

/** Score so the large left portrait wins over the small top-left crest. */
function scorePicture(pic: PicCandidate): number {
  const areaRatio = pic.area / (SLIDE_WIDTH_EMU * SLIDE_HEIGHT_EMU);
  const aspect = pic.cy / Math.max(pic.cx, 1);
  const centerY = (pic.y + pic.cy / 2) / SLIDE_HEIGHT_EMU;
  const centerX = (pic.x + pic.cx / 2) / SLIDE_WIDTH_EMU;

  let score = areaRatio * 100;

  // Header crest: small, top-left — heavily penalize
  const isHeaderLogo =
    pic.y < SLIDE_HEIGHT_EMU * 0.22 &&
    pic.x < SLIDE_WIDTH_EMU * 0.28 &&
    areaRatio < 0.08;
  if (isHeaderLogo) score -= 80;

  // Player photo panel: large frame, mid-left, often portrait
  if (centerY > 0.28 && centerY < 0.85 && centerX < 0.55) score += 25;
  if (aspect >= 1.05) score += 15; // taller than wide
  if (areaRatio >= 0.08) score += 20;
  if (areaRatio >= 0.12) score += 10;

  return score;
}

async function bytesToDataUrl(
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mime};base64,${base64}`;
}

async function extractSlidePhoto(
  zip: JSZip,
  slidePath: string,
  slideXml: string,
): Promise<string> {
  const relPath = slidePath
    .replace("ppt/slides/", "ppt/slides/_rels/")
    .replace(/\.xml$/i, ".xml.rels");

  const relsFile = zip.file(relPath);
  if (!relsFile) return "";

  const relsXml = await relsFile.async("string");
  const pictures = collectSlidePictures(slideXml);

  type Ranked = {
    score: number;
    area: number;
    byteSize: number;
    dataUrl: string;
  };
  const ranked: Ranked[] = [];

  for (const pic of pictures) {
    const targetRaw = lookupEmbedTarget(relsXml, pic.embedId);
    if (!targetRaw) continue;

    const target = resolveMediaTarget(targetRaw);
    const mime = mimeForPath(target);
    if (mime === "application/octet-stream") continue;

    const mediaFile = zip.file(target) ?? zip.file(decodeURIComponent(target));
    if (!mediaFile) continue;

    const bytes = await mediaFile.async("uint8array");
    if (bytes.byteLength < MIN_PHOTO_BYTES) continue;

    ranked.push({
      score: scorePicture(pic),
      area: pic.area,
      byteSize: bytes.byteLength,
      dataUrl: await bytesToDataUrl(bytes, mime),
    });
  }

  if (ranked.length > 0) {
    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.area !== a.area) return b.area - a.area;
      return b.byteSize - a.byteSize;
    });
    return ranked[0]?.dataUrl ?? "";
  }

  // Fallback when xfrm geometry is missing: largest non-tiny embed,
  // prefer JPEG (player photos) over PNG (often the crest).
  const embedIds = [
    ...new Set(
      [...slideXml.matchAll(/r:embed="([^"]+)"/gi)].map((m) => m[1] ?? ""),
    ),
  ].filter(Boolean);

  type Fallback = { dataUrl: string; size: number; prefer: number };
  const fallbacks: Fallback[] = [];

  for (const embedId of embedIds) {
    const targetRaw = lookupEmbedTarget(relsXml, embedId);
    if (!targetRaw) continue;
    const target = resolveMediaTarget(targetRaw);
    const mime = mimeForPath(target);
    if (mime === "application/octet-stream") continue;
    const mediaFile = zip.file(target);
    if (!mediaFile) continue;
    const bytes = await mediaFile.async("uint8array");
    if (bytes.byteLength < MIN_PHOTO_BYTES) continue;
    fallbacks.push({
      dataUrl: await bytesToDataUrl(bytes, mime),
      size: bytes.byteLength,
      prefer: mime === "image/jpeg" ? 2 : mime === "image/png" ? 0 : 1,
    });
  }

  if (fallbacks.length === 0) return "";
  fallbacks.sort((a, b) => {
    if (b.prefer !== a.prefer) return b.prefer - a.prefer;
    return b.size - a.size;
  });
  return fallbacks[0]?.dataUrl ?? "";
}

export async function parsePptxPlayers(
  buffer: ArrayBuffer,
): Promise<ParsedPptxPlayer[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter(
      (path) =>
        /^ppt\/slides\/slide\d+\.xml$/i.test(path) && !zip.files[path]?.dir,
    )
    .sort((a, b) => {
      const ai = Number(a.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      const bi = Number(b.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      return ai - bi;
    });

  const players: ParsedPptxPlayer[] = [];

  for (const slidePath of slidePaths) {
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const slideXml = await slideFile.async("string");
    const texts = extractSlideTexts(slideXml);
    const fields = parseSlideFields(texts);

    if (!fields.name) continue;

    const photo = await extractSlidePhoto(zip, slidePath, slideXml);

    players.push({
      ...fields,
      photo,
    });
  }

  return players;
}
