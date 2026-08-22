import { expect, test } from "vite-plus/test";
import { estimateCells, SITE_PALETTE, toConvertOptions } from "../src/options.ts";

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
  });
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
