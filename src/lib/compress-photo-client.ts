/** Shrink a player photo and punch out the studio black backdrop. */

const MAX_WIDTH = 360;
const MAX_HEIGHT = 480;
const WEBP_QUALITY = 0.62;

export async function compressPhotoForUpload(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl;
  return removeBlackBackdrop(dataUrl);
}

export async function removeBlackBackdrop(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl;

  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_WIDTH / image.width, MAX_HEIGHT / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);
  punchOutBlack(ctx, width, height);

  const webp = canvas.toDataURL("image/webp", WEBP_QUALITY);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/png");
}

function punchOutBlack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const chroma = max - Math.min(r, g, b);
    if (max < 18 && chroma < 10) {
      pixels[i + 3] = 0;
    } else if (max < 40 && chroma < 14) {
      pixels[i + 3] = Math.round(((max - 18) / 22) * (pixels[i + 3] ?? 0));
    }
  }
  ctx.putImageData(image, 0, 0);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read a player photo"));
    image.src = src;
  });
}
