import { cssVariablePalette } from "termpic";
import type { ConvertOptions } from "termpic";

/** 個人サイトのデザイントークン。役割（変数名）と色の対応 */
export const SITE_TOKENS = {
  "--bg": "#0b0e0f",
  "--bg-elev": "#131819",
  "--border": "#223028",
  "--fg-dim": "#8b9a93",
  "--fg": "#cfd8d3",
  "--accent": "#7ee787",
  "--accent-2": "#79c0ff",
  "--accent-3": "#ffa657",
} as const;

const SITE = cssVariablePalette(SITE_TOKENS);

export const SITE_PALETTE = SITE.palette;
export const SITE_COLORS = SITE.colors;

/** フォームの値。すべて文字列で持ち、変換時に解釈する */
export interface FormValues {
  mode: string;
  cols: string;
  palette: string;
  dither: string;
  background: string;
}

const usesSitePalette = (choice: string): boolean => choice === "site" || choice === "site-vars";

/**
 * フォームの値を変換オプションに直す。
 * 数値は範囲に丸め、想定外の値は既定値に落とす。
 */
export function toConvertOptions(values: FormValues): ConvertOptions {
  const cols = Number.parseInt(values.cols, 10);
  return {
    mode: values.mode === "ascii" ? "ascii" : "halfblock",
    cols: Number.isFinite(cols) ? Math.min(240, Math.max(8, cols)) : 60,
    palette: usesSitePalette(values.palette) ? [...SITE_PALETTE] : undefined,
    dither: values.dither === "true",
    background: values.background === "light" ? "light" : "dark",
  };
}

/**
 * 出力の色を CSS 変数に差し替える対応表。
 * `site-vars` を選んだときだけ返す（絵がテーマの切り替えに追従する）。
 */
export function toColorMapping(values: FormValues): Record<string, string> | undefined {
  return values.palette === "site-vars" ? { ...SITE_COLORS } : undefined;
}

/** 出力の見積もり。大きすぎる指定に気づけるようにする */
export function estimateCells(cols: number, aspect: number, imageAspect: number): number {
  const rows = Math.max(1, Math.round((cols * imageAspect) / aspect));
  return cols * rows;
}
