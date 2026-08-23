import { toSvg } from "termpic";
import type { Grid } from "termpic";

/**
 * SVG をいったん画像として読み込み、canvas に描いて PNG にする。
 *
 * 矩形と円だけで描くモード（半ブロック・四分割・点字）はフォントに依存しない。
 * ascii モードだけは文字を描くので、環境のフォントに左右される。
 */
export async function toPngBlob(grid: Grid, cellSize = 12): Promise<Blob> {
  const svg = toSvg(grid, { cellSize });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve());
      image.addEventListener("error", () => reject(new Error("SVG を画像として読み込めません")));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = grid.cols * cellSize;
    canvas.height = Math.round(grid.rows * cellSize * grid.cellAspect);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas の 2d コンテキストを取得できません");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG に変換できません"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Blob をファイルとして保存させる */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
