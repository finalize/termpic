import { formatHex, nearestColor, toOklab } from "contrast-kit";

/** 変換元の画像。ブラウザの `ImageData` と同じ形 */
export interface Bitmap {
  width: number;
  height: number;
  /** RGBA が 4 バイトずつ並んだ配列 */
  data: Uint8ClampedArray | readonly number[];
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** 出力1マスぶん */
export interface Cell {
  char: string;
  /** 文字色（#rrggbb） */
  fg: string;
  /** 背景色。ascii モードでは付かない */
  bg?: string;
}

export type Mode = "ascii" | "halfblock";

export interface Grid {
  cols: number;
  rows: number;
  mode: Mode;
  /** セルの縦横比（高さ ÷ 幅）。SVG に落とすときに必要 */
  cellAspect: number;
  cells: Cell[];
}

/** 薄い → 濃い の順に並べた既定の濃淡ランプ */
export const DEFAULT_RAMP = " .:-=+*#%@";

/** 上半分を文字色、下半分を背景色で塗る文字 */
const HALF_BLOCK = "▀";

export interface ConvertOptions {
  /** ascii = 濃淡の文字だけ / halfblock = 上下2色のマス（既定） */
  mode?: Mode;
  /** 横方向のマス数。既定 60 */
  cols?: number;
  /** ascii モードの濃淡ランプ（薄い → 濃い） */
  ramp?: string;
  /** 量子化先のパレット。省略すると元の色をそのまま使う */
  palette?: readonly string[];
  /** パレット量子化のときに誤差拡散（Floyd–Steinberg）を行う */
  dither?: boolean;
  /**
   * 等幅フォント1文字の縦横比（高さ ÷ 幅）。既定 2。
   * 1 にすると出力が縦に間延びするので、通常は変えない。
   */
  cellAspect?: number;
  /**
   * 出力を置く背景。`dark` では明るい画素ほど濃い文字を使う
   * （濃い文字ほど地の暗さを覆って明るく見えるため）。既定 `dark`
   */
  background?: "dark" | "light";
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 指定した矩形の平均色。範囲外は切り詰める */
function averageRect(
  bitmap: Bitmap,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb {
  const x0 = clamp(Math.floor(left), 0, bitmap.width);
  const x1 = clamp(Math.ceil(right), x0 + 1, bitmap.width);
  const y0 = clamp(Math.floor(top), 0, bitmap.height);
  const y1 = clamp(Math.ceil(bottom), y0 + 1, bitmap.height);

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const index = (y * bitmap.width + x) * 4;
      const alpha = (bitmap.data[index + 3] ?? 255) / 255;
      // 透明な画素は黒として扱う（背景に溶ける）
      r += (bitmap.data[index] ?? 0) * alpha;
      g += (bitmap.data[index + 1] ?? 0) * alpha;
      b += (bitmap.data[index + 2] ?? 0) * alpha;
      count++;
    }
  }

  return count === 0 ? { r: 0, g: 0, b: 0 } : { r: r / count, g: g / count, b: b / count };
}

/** 誤差拡散つきでパレットに量子化する。palette が無ければそのまま返す */
function quantize(
  samples: Rgb[],
  cols: number,
  rows: number,
  palette: readonly string[] | undefined,
  dither: boolean,
): string[] {
  if (!palette || palette.length === 0) {
    return samples.map((sample) =>
      formatHex({
        r: Math.round(clamp(sample.r, 0, 255)),
        g: Math.round(clamp(sample.g, 0, 255)),
        b: Math.round(clamp(sample.b, 0, 255)),
      }),
    );
  }

  const working = samples.map((sample) => ({ ...sample }));
  const result: string[] = [];

  const spread = (index: number, error: Rgb, factor: number): void => {
    const target = working[index];
    if (!target) return;
    target.r += error.r * factor;
    target.g += error.g * factor;
    target.b += error.b * factor;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const index = y * cols + x;
      const current = working[index]!;
      const rounded = {
        r: Math.round(clamp(current.r, 0, 255)),
        g: Math.round(clamp(current.g, 0, 255)),
        b: Math.round(clamp(current.b, 0, 255)),
      };
      const picked = nearestColor(rounded, palette);
      result.push(picked);

      if (!dither) continue;

      const chosen = hexToRgb(picked);
      const error = {
        r: current.r - chosen.r,
        g: current.g - chosen.g,
        b: current.b - chosen.b,
      };
      if (x + 1 < cols) spread(index + 1, error, 7 / 16);
      if (y + 1 < rows) {
        if (x > 0) spread(index + cols - 1, error, 3 / 16);
        spread(index + cols, error, 5 / 16);
        if (x + 1 < cols) spread(index + cols + 1, error, 1 / 16);
      }
    }
  }
  return result;
}

function hexToRgb(hex: string): Rgb {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/**
 * 画像をターミナル表現のマス目に変換する。
 *
 * `cellAspect`（既定 2）は等幅フォント1文字の縦横比。1マスは横 `blockW`・
 * 縦 `blockW * cellAspect` ピクセルぶんを受け持つので、丸は丸のまま出る。
 */
export function convert(bitmap: Bitmap, options: ConvertOptions = {}): Grid {
  if (bitmap.width <= 0 || bitmap.height <= 0) {
    throw new TypeError("画像の大きさが 0 です");
  }

  const mode = options.mode ?? "halfblock";
  const cols = Math.max(1, Math.floor(options.cols ?? 60));
  const cellAspect = options.cellAspect ?? 2;
  const ramp = options.ramp ?? DEFAULT_RAMP;
  const background = options.background ?? "dark";

  const blockW = bitmap.width / cols;
  const blockH = blockW * cellAspect;
  const rows = Math.max(1, Math.round(bitmap.height / blockH));

  // halfblock は1マスにつき上下2つ、ascii は1つを標本にする
  const perCell = mode === "halfblock" ? 2 : 1;
  const sampleRows = rows * perCell;
  const sampleH = blockH / perCell;

  const samples: Rgb[] = [];
  for (let y = 0; y < sampleRows; y++) {
    for (let x = 0; x < cols; x++) {
      samples.push(
        averageRect(bitmap, x * blockW, y * sampleH, (x + 1) * blockW, (y + 1) * sampleH),
      );
    }
  }

  const colors = quantize(samples, cols, sampleRows, options.palette, options.dither ?? false);

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (mode === "halfblock") {
        cells.push({
          char: HALF_BLOCK,
          fg: colors[row * 2 * cols + col]!,
          bg: colors[(row * 2 + 1) * cols + col]!,
        });
      } else {
        const fg = colors[row * cols + col]!;
        const lightness = toOklab(fg).L;
        const level = background === "dark" ? lightness : 1 - lightness;
        const index = clamp(Math.round(level * (ramp.length - 1)), 0, ramp.length - 1);
        cells.push({ char: ramp[index]!, fg });
      }
    }
  }

  return { cols, rows, mode, cellAspect, cells };
}

/**
 * CSS カスタムプロパティの組から、量子化用のパレットと
 * 出力用の色の対応表を作る。
 *
 * ```ts
 * const { palette, colors } = cssVariablePalette({
 *   "--bg": "#0b0e0f",
 *   "--accent": "#7ee787",
 * });
 * const grid = convert(bitmap, { palette });
 * toHtml(grid, { colors }); // 色が var(--accent) で出る
 * ```
 *
 * 役割（変数名）で色を持つので、ライト/ダークでトークンの値が入れ替わる
 * サイトなら、出力した絵もテーマの切り替えに追従する。
 * 同じ色が複数の名前に割り当てられている場合は、先に現れた名前を使う。
 */
export function cssVariablePalette(variables: Readonly<Record<string, string>>): {
  palette: string[];
  colors: Record<string, string>;
} {
  const palette: string[] = [];
  const colors: Record<string, string> = {};

  for (const [name, value] of Object.entries(variables)) {
    const hex = formatHex(value.trim());
    if (colors[hex] !== undefined) continue;
    palette.push(hex);
    colors[hex] = `var(${name})`;
  }
  return { palette, colors };
}
