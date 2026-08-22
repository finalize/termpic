import type { Bitmap } from "termpic";

/** 変換前に縮小する上限。これ以上大きい画像は間引いてから読む */
const MAX_SIDE = 1600;

/** File / Blob を Bitmap に読み込む。大きすぎる画像は縮小する */
export async function readBitmap(source: Blob): Promise<Bitmap> {
  const image = await createImageBitmap(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas の 2d コンテキストを取得できません");

  context.drawImage(image, 0, 0, width, height);
  image.close();

  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** 何も読み込んでいないときに見せる合成画像 */
export function sampleBitmap(size = 240): Bitmap {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center) / center;
      const ring = Math.max(0, 1 - Math.abs(distance - 0.62) * 6);
      const glow = Math.max(0, 1 - distance * 1.15);
      const index = (y * size + x) * 4;
      data[index] = Math.round(255 * (ring * 0.5 + glow * 0.15));
      data[index + 1] = Math.round(255 * (ring * 0.95 + glow * 0.55));
      data[index + 2] = Math.round(255 * (ring * 0.6 + glow * 0.35));
      data[index + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
