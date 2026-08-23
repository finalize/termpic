import { expect, test } from "vite-plus/test";
import {
  estimateCells,
  SITE_PALETTE,
  toColorMapping,
  toConvertOptions,
  usesExtractedPalette,
} from "../src/options.ts";

const base = {
  mode: "halfblock",
  cols: "60",
  palette: "original",
  dither: "false",
  background: "dark",
};

test("既定値をそのまま変換する", () => {
  expect(toConvertOptions(base)).toEqual({
    mode: "halfblock",
    cols: 60,
    palette: undefined,
    dither: false,
    background: "dark",
    edges: false,
  });
});

test("4つのモードをそのまま通し、想定外は halfblock に落とす", () => {
  for (const mode of ["ascii", "halfblock", "quadrant", "braille"]) {
    expect(toConvertOptions({ ...base, mode }).mode).toBe(mode);
  }
  expect(toConvertOptions({ ...base, mode: "???" }).mode).toBe("halfblock");
});

test("画像から抽出する設定かを判定する", () => {
  expect(usesExtractedPalette({ ...base, palette: "extract" })).toBe(true);
  expect(usesExtractedPalette({ ...base, palette: "site" })).toBe(false);
});

test("マス数は 8〜240 に丸める", () => {
  expect(toConvertOptions({ ...base, cols: "2" }).cols).toBe(8);
  expect(toConvertOptions({ ...base, cols: "9999" }).cols).toBe(240);
  expect(toConvertOptions({ ...base, cols: "" }).cols).toBe(60);
});

test("想定外の値は既定に落とす", () => {
  const options = toConvertOptions({ ...base, mode: "???", background: "???" });
  expect(options.mode).toBe("halfblock");
  expect(options.background).toBe("dark");
});

test("site を選ぶとサイトのパレットになる", () => {
  expect(toConvertOptions({ ...base, palette: "site" }).palette).toEqual([...SITE_PALETTE]);
});

test("マス数の見積もりは縦横比を考える", () => {
  // 正方形の画像・セルは縦2倍 → 行数は列数の半分
  expect(estimateCells(60, 2, 1)).toBe(60 * 30);
});

test("site-vars でも量子化には同じパレットを使う", () => {
  expect(toConvertOptions({ ...base, palette: "site-vars" }).palette).toEqual([...SITE_PALETTE]);
});

test("CSS 変数への差し替えは site-vars のときだけ", () => {
  expect(toColorMapping({ ...base, palette: "site" })).toBeUndefined();
  expect(toColorMapping({ ...base, palette: "site-vars" })!["#7ee787"]).toBe("var(--accent)");
});
