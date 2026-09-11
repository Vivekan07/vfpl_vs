/** Shrink a player photo in the browser so import batches stay under Vercel limits. */

const MAX_WIDTH = 360;
const MAX_HEIGHT = 480;
const JPEG_QUALITY = 0.55;

export async function compressPhotoForUpload(dataUrl: string): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return dataUrl;

  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_WIDTH / image.width, MAX_HEIGHT / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, width, height);

  const out = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return out.length < dataUrl.length ? out : dataUrl;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read a player photo"));
    image.src = src;
  });
}
