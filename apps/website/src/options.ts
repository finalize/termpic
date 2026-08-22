import type { ConvertOptions } from "termpic";

/** サイトの配色に寄せたいときに使うパレット */
export const SITE_PALETTE = [
  "#0b0e0f",
  "#131819",
  "#223028",
  "#8b9a93",
  "#cfd8d3",
  "#7ee787",
  "#79c0ff",
  "#ffa657",
] as const;

export type PaletteChoice = "original" | "site";

/** フォームの値。すべて文字列で持ち、変換時に解釈する */
export interface FormValues {
  mode: string;
  cols: string;
  palette: string;
  dither: string;
  background: string;
}

/**
 * フォームの値を変換オプションに直す。
 * 数値は範囲に丸め、想定外の値は既定値に落とす。
 */
export function toConvertOptions(values: FormValues): ConvertOptions {
  const cols = Number.parseInt(values.cols, 10);
  return {
    mode: values.mode === "ascii" ? "ascii" : "halfblock",
    cols: Number.isFinite(cols) ? Math.min(240, Math.max(8, cols)) : 60,
    palette: values.palette === "site" ? [...SITE_PALETTE] : undefined,
    dither: values.dither === "true",
    background: values.background === "light" ? "light" : "dark",
  };
}

/** 出力の見積もり。大きすぎる指定に気づけるようにする */
export function estimateCells(cols: number, aspect: number, imageAspect: number): number {
  const rows = Math.max(1, Math.round((cols * imageAspect) / aspect));
  return cols * rows;
}
