import { expect, test } from "vite-plus/test";
import type { Bitmap } from "../src/index.ts";
import {
  convert,
  cssVariablePalette,
  DEFAULT_RAMP,
  toAnsi,
  toHtml,
  toSvg,
  toText,
} from "../src/index.ts";

/** 合成画像を作る。paint は各画素の [r, g, b] を返す */
function bitmap(
  width: number,
  height: number,
  paint: (x: number, y: number) => readonly [number, number, number],
): Bitmap {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

const solid = (color: readonly [number, number, number]) => () => color;

test("セルの縦横比のぶんだけ行数が減る", () => {
  const grid = convert(bitmap(120, 120, solid([255, 255, 255])), { mode: "ascii", cols: 60 });
  expect(grid.cols).toBe(60);
  // 1マスは横2px・縦4px を受け持つので 120 / 4 = 30 行
  expect(grid.rows).toBe(30);
});

test("円は円のまま出る（縦に伸びない）", () => {
  const size = 120;
  const radius = 50;
  const image = bitmap(size, size, (x, y) => {
    const dx = x - size / 2;
    const dy = y - size / 2;
    return dx * dx + dy * dy <= radius * radius ? [255, 255, 255] : [0, 0, 0];
  });

  const grid = convert(image, { mode: "ascii", cols: 60 });

  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = -1;
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.cells[row * grid.cols + col]!.char !== " ") {
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }
  }

  const colSpan = maxCol - minCol + 1;
  const rowSpan = maxRow - minRow + 1;
  // マスが縦長なので、列数は行数のちょうど cellAspect 倍になるはず
  expect(colSpan / rowSpan).toBeCloseTo(grid.cellAspect, 0);
});

test("中間グレーは濃淡ランプの真ん中になる", () => {
  const grid = convert(bitmap(10, 4, solid([128, 128, 128])), { mode: "ascii", cols: 10 });
  // OKLab の L は 0.60 なので ramp[5]。
  // WCAG の相対輝度（0.216）で割り当てると ramp[2] になり、暗部に偏る
  expect(grid.cells[0]!.char).toBe(DEFAULT_RAMP[5]);
});

test("明るい背景では濃淡が反転する", () => {
  const image = bitmap(10, 4, solid([255, 255, 255]));
  expect(convert(image, { mode: "ascii", cols: 10 }).cells[0]!.char).toBe("@");
  expect(convert(image, { mode: "ascii", cols: 10, background: "light" }).cells[0]!.char).toBe(" ");
});

test("halfblock は1マスに上下2色を持つ", () => {
  const image = bitmap(4, 8, (_x, y) => (y < 4 ? [255, 0, 0] : [0, 0, 255]));
  // cols=1 なら1マスが 4x8px を受け持ち、上半分が赤・下半分が青になる
  const grid = convert(image, { mode: "halfblock", cols: 1 });
  expect(grid.rows).toBe(1);
  expect(grid.cells[0]).toEqual({ char: "▀", fg: "#ff0000", bg: "#0000ff" });
});

test("パレットを渡すとその色だけになる", () => {
  const palette = ["#0b0e0f", "#7ee787"];
  const grid = convert(bitmap(8, 8, solid([130, 240, 140])), {
    mode: "halfblock",
    cols: 4,
    palette,
  });
  for (const cell of grid.cells) {
    expect(cell.fg).toBe("#7ee787");
  }
});

test("誤差拡散を入れると単色にならず2色が混ざる", () => {
  const image = bitmap(16, 16, solid([128, 128, 128]));
  const palette = ["#000000", "#ffffff"];

  const flat = convert(image, { mode: "halfblock", cols: 8, palette });
  const dithered = convert(image, { mode: "halfblock", cols: 8, palette, dither: true });

  const used = (grid: typeof flat) => new Set(grid.cells.flatMap((cell) => [cell.fg, cell.bg!]));
  expect(used(flat).size).toBe(1);
  expect(used(dithered).size).toBe(2);
});

test("大きさ 0 の画像は TypeError", () => {
  expect(() => convert({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toThrow(TypeError);
});

test("toText は行末の空白を落とす", () => {
  const image = bitmap(8, 8, (x) => (x < 4 ? [255, 255, 255] : [0, 0, 0]));
  const text = toText(convert(image, { mode: "ascii", cols: 8 }));
  expect(text.split("\n")[0]).toBe("@@@@");
});

test("toHtml は同じ色が続く区間を1つの span にまとめる", () => {
  const image = bitmap(8, 8, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]));
  const html = toHtml(convert(image, { mode: "halfblock", cols: 8 }), { alt: "テスト" });
  expect(html.startsWith("<pre ")).toBe(true);
  expect(html).toContain('role="img" aria-label="テスト"');
  expect(html.split("\n")[0]!.match(/<span/gu)).toHaveLength(2);
});

test("toSvg は halfblock を矩形だけで描く", () => {
  const grid = convert(bitmap(8, 8, solid([255, 0, 0])), { mode: "halfblock", cols: 4 });
  const svg = toSvg(grid, { cellSize: 10 });
  expect(svg).toContain('viewBox="0 0 40 40"');
  expect(svg).toContain("<rect");
  expect(svg).not.toContain("<text");
});

test("toAnsi は前景色と背景色のエスケープを出す", () => {
  const grid = convert(
    bitmap(4, 8, (_x, y) => (y < 4 ? [255, 0, 0] : [0, 0, 255])),
    {
      mode: "halfblock",
      cols: 2,
    },
  );
  const ansi = toAnsi(grid);
  expect(ansi).toContain("\u001b[38;2;255;0;0m");
  expect(ansi).toContain("\u001b[48;2;0;0;255m");
  expect(ansi.endsWith("\u001b[0m")).toBe(true);
});

test("CSS 変数からパレットと対応表を作る", () => {
  const { palette, colors } = cssVariablePalette({
    "--bg": "#0b0e0f",
    "--accent": " #7ee787 ",
    "--same": "#0b0e0f",
  });
  expect(palette).toEqual(["#0b0e0f", "#7ee787"]);
  expect(colors).toEqual({ "#0b0e0f": "var(--bg)", "#7ee787": "var(--accent)" });
});

test("colors を渡すと出力が CSS 変数になる", () => {
  const { palette, colors } = cssVariablePalette({ "--bg": "#000000", "--accent": "#7ee787" });
  const grid = convert(bitmap(8, 8, solid([126, 231, 135])), {
    mode: "halfblock",
    cols: 4,
    palette,
  });

  expect(toHtml(grid, { colors })).toContain("color:var(--accent)");
  expect(toSvg(grid, { colors })).toContain('fill="var(--accent)"');
  // ANSI は実際の色の数値が要るので差し替えない
  expect(toAnsi(grid)).toContain("126;231;135");
});

test("対応表に無い色はそのまま出る", () => {
  const grid = convert(bitmap(8, 8, solid([255, 0, 0])), { mode: "halfblock", cols: 4 });
  expect(toHtml(grid, { colors: { "#00ff00": "var(--x)" } })).toContain("color:#ff0000");
});
