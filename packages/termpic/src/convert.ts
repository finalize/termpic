import { formatHex, nearestColor, parseHex, toOklab } from "contrast-kit";

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

export type Mode = "ascii" | "halfblock" | "quadrant" | "braille";

/** 1マスが受け持つ小マスの数（横 × 縦） */
const SUBCELLS: Record<Mode, readonly [number, number]> = {
  ascii: [1, 1],
  halfblock: [1, 2],
  quadrant: [2, 2],
  braille: [2, 4],
};

/**
 * 四分割ブロックの文字。添字のビットは
 * 1=左上 / 2=右上 / 4=左下 / 8=右下 に対応する。
 */
export const QUADRANTS = " ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█";

/**
 * 点字の 2x4 の点と Unicode のビットの対応。
 * 上3段は 0,1,2（左）/ 3,4,5（右）、最下段だけ 6（左）/ 7（右）と離れている。
 */
export const BRAILLE_BITS: readonly (readonly [number, number])[] = [
  [0, 3],
  [1, 4],
  [2, 5],
  [6, 7],
];

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

export interface ConvertOptions {
  /**
   * - `ascii` 濃淡の文字だけ
   * - `halfblock` 上下2色のマス（既定）
   * - `quadrant` 四分割。横の解像度が倍になる
   * - `braille` 点字。1マスに 2x4 の点を持てるので最も細かいが、色は1マスにつき1色
   */
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
   * ascii モードで輪郭を拾い、傾きに応じて `-` `/` `|` `\\` を割り当てる。
   * 数値を渡すとその値を閾値にする（既定 0.12）。
   */
  edges?: boolean | number;
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
  const [subCols, subRows] = SUBCELLS[mode];

  const blockW = bitmap.width / cols;
  const blockH = blockW * cellAspect;
  const rows = Math.max(1, Math.round(bitmap.height / blockH));

  // 1マスを subCols x subRows の小マスに割り、その一つずつを標本にする
  const sampleCols = cols * subCols;
  const sampleRows = rows * subRows;
  const sampleW = blockW / subCols;
  const sampleH = blockH / subRows;

  const samples: Rgb[] = [];
  for (let y = 0; y < sampleRows; y++) {
    for (let x = 0; x < sampleCols; x++) {
      samples.push(
        averageRect(bitmap, x * sampleW, y * sampleH, (x + 1) * sampleW, (y + 1) * sampleH),
      );
    }
  }

  const colors = quantize(
    samples,
    sampleCols,
    sampleRows,
    options.palette,
    options.dither ?? false,
  );
  const at = (x: number, y: number): string => colors[y * sampleCols + x]!;

  // 点字は1マスに1色しか持てないので、点の有無だけで図と地を表す。
  // マスごとの中間値で切ると、一様なマスが必ず全点灯になって図地が反転するため、
  // 画像全体の平均の明度を閾値にする。
  const threshold =
    colors.reduce((total, color) => total + toOklab(color).L, 0) / Math.max(1, colors.length);

  const edgeChars =
    mode === "ascii" && options.edges
      ? detectEdges(
          colors,
          cols,
          rows,
          cellAspect,
          typeof options.edges === "number" ? options.edges : 0.12,
        )
      : undefined;

  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = buildCell({ mode, ramp, background, at, col, row, threshold });
      const edge = edgeChars?.[row * cols + col];
      cells.push(edge === undefined ? cell : { ...cell, char: edge });
    }
  }

  return { cols, rows, mode, cellAspect, cells };
}

interface CellContext {
  mode: Mode;
  ramp: string;
  background: "dark" | "light";
  at: (x: number, y: number) => string;
  col: number;
  row: number;
  /** 点字で点を打つかどうかの境目（画像全体の平均の明度） */
  threshold: number;
}

/** 明るい側と暗い側に二分し、どの小マスが明るい側かをビットで返す */
function splitByLightness(colors: readonly string[]): {
  bits: number;
  light: string;
  dark: string;
} {
  const levels = colors.map((color) => toOklab(color).L);
  const middle = (Math.min(...levels) + Math.max(...levels)) / 2;

  let bits = 0;
  const lightGroup: string[] = [];
  const darkGroup: string[] = [];
  for (const [index, level] of levels.entries()) {
    if (level >= middle) {
      bits |= 1 << index;
      lightGroup.push(colors[index]!);
    } else {
      darkGroup.push(colors[index]!);
    }
  }

  return {
    bits,
    light: averageHex(lightGroup.length > 0 ? lightGroup : colors),
    dark: averageHex(darkGroup.length > 0 ? darkGroup : colors),
  };
}

function averageHex(colors: readonly string[]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    const rgb = parseHex(color);
    r += rgb.r;
    g += rgb.g;
    b += rgb.b;
  }
  const count = colors.length;
  return formatHex({
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  });
}

function buildCell(context: CellContext): Cell {
  const { mode, at, col, row } = context;

  if (mode === "halfblock") {
    return { char: "▀", fg: at(col, row * 2), bg: at(col, row * 2 + 1) };
  }

  if (mode === "quadrant") {
    const corners = [
      at(col * 2, row * 2),
      at(col * 2 + 1, row * 2),
      at(col * 2, row * 2 + 1),
      at(col * 2 + 1, row * 2 + 1),
    ];
    const { bits, light, dark } = splitByLightness(corners);
    return { char: QUADRANTS[bits]!, fg: light, bg: dark };
  }

  if (mode === "braille") {
    const dots: string[] = [];
    for (let y = 0; y < 4; y++) {
      dots.push(at(col * 2, row * 4 + y), at(col * 2 + 1, row * 4 + y));
    }
    const levels = dots.map((color) => toOklab(color).L);
    // 明るい背景に置くなら、暗い画素の側に点を打つ
    const isLit = (level: number): boolean =>
      context.background === "dark" ? level >= context.threshold : level < context.threshold;

    let pattern = 0;
    const lit: string[] = [];
    const unlit: string[] = [];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 2; x++) {
        const index = y * 2 + x;
        if (isLit(levels[index]!)) {
          pattern |= 1 << BRAILLE_BITS[y]![x]!;
          lit.push(dots[index]!);
        } else {
          unlit.push(dots[index]!);
        }
      }
    }
    // 点の色だけだと、点が付かない側が地の色に溶けて図地が反転して見える。
    // 点いていない側の平均を背景色として持たせる
    return {
      char: String.fromCodePoint(0x2800 + pattern),
      fg: averageHex(lit.length > 0 ? lit : dots),
      bg: averageHex(unlit.length > 0 ? unlit : dots),
    };
  }

  const fg = at(col, row);
  const lightness = toOklab(fg).L;
  const level = context.background === "dark" ? lightness : 1 - lightness;
  const index = clamp(Math.round(level * (context.ramp.length - 1)), 0, context.ramp.length - 1);
  return { char: context.ramp[index]!, fg };
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

/**
 * 画像自身から代表色を求める（中央値分割法）。
 *
 * 決め打ちのパレットに落とすと、そこに無い色（茶色など）が破綻する。
 * 画像を色空間の直方体として持ち、最も幅の広い軸で中央値に切る操作を
 * 箱が `count` 個になるまで繰り返し、各箱の平均色を代表色にする。
 *
 * `sampleLimit` を超える画素数の画像は間引いて読む（既定 20000）。
 */
export function extractPalette(bitmap: Bitmap, count = 16, sampleLimit = 20_000): string[] {
  if (count < 1) throw new TypeError("色数は 1 以上にしてください");

  const total = bitmap.width * bitmap.height;
  const step = Math.max(1, Math.ceil(total / sampleLimit));
  const pixels: Rgb[] = [];
  for (let index = 0; index < total; index += step) {
    const offset = index * 4;
    if ((bitmap.data[offset + 3] ?? 255) === 0) continue;
    pixels.push({
      r: bitmap.data[offset] ?? 0,
      g: bitmap.data[offset + 1] ?? 0,
      b: bitmap.data[offset + 2] ?? 0,
    });
  }
  if (pixels.length === 0) return ["#000000"];

  let boxes: Rgb[][] = [pixels];
  while (boxes.length < count) {
    // 最も幅の広い軸を持つ箱を選び、その軸の中央値で切る
    let target = -1;
    let widestSpread = 0;
    let widestAxis: keyof Rgb = "r";

    for (const [index, box] of boxes.entries()) {
      if (box.length < 2) continue;
      for (const axis of ["r", "g", "b"] as const) {
        const values = box.map((pixel) => pixel[axis]);
        const spread = Math.max(...values) - Math.min(...values);
        if (spread > widestSpread) {
          widestSpread = spread;
          widestAxis = axis;
          target = index;
        }
      }
    }
    if (target === -1) break;

    const box = [...boxes[target]!].sort((a, b) => a[widestAxis] - b[widestAxis]);
    const middle = Math.floor(box.length / 2);
    boxes = [
      ...boxes.slice(0, target),
      box.slice(0, middle),
      box.slice(middle),
      ...boxes.slice(target + 1),
    ];
  }

  return boxes
    .filter((box) => box.length > 0)
    .map((box) => {
      const sum = box.reduce(
        (total2, pixel) => ({
          r: total2.r + pixel.r,
          g: total2.g + pixel.g,
          b: total2.b + pixel.b,
        }),
        { r: 0, g: 0, b: 0 },
      );
      return formatHex({
        r: Math.round(sum.r / box.length),
        g: Math.round(sum.g / box.length),
        b: Math.round(sum.b / box.length),
      });
    });
}

/** 輪郭の向きに割り当てる文字。添字は 0=横 / 1=右下がり / 2=縦 / 3=右上がり */
const EDGE_CHARS = ["-", "\\", "|", "/"] as const;

/**
 * Sobel フィルタでマス目の明度の傾きを取り、輪郭が強いマスに向きの文字を割り当てる。
 *
 * マスは縦長なので、画面上の角度に直すために縦方向の傾きへ `cellAspect` を掛ける。
 * これを忘れると斜めの輪郭がすべて縦寄りに倒れる。
 */
function detectEdges(
  colors: readonly string[],
  cols: number,
  rows: number,
  cellAspect: number,
  threshold: number,
): (string | undefined)[] {
  const lightness = colors.map((color) => toOklab(color).L);
  const at = (x: number, y: number): number =>
    lightness[clamp(y, 0, rows - 1) * cols + clamp(x, 0, cols - 1)]!;

  return Array.from({ length: cols * rows }, (_, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const gx =
      -at(col - 1, row - 1) +
      at(col + 1, row - 1) +
      -2 * at(col - 1, row) +
      2 * at(col + 1, row) +
      -at(col - 1, row + 1) +
      at(col + 1, row + 1);
    const gy =
      -at(col - 1, row - 1) -
      2 * at(col, row - 1) -
      at(col + 1, row - 1) +
      at(col - 1, row + 1) +
      2 * at(col, row + 1) +
      at(col + 1, row + 1);

    if (Math.hypot(gx, gy) / 4 < threshold) return undefined;

    // 輪郭は傾きに直交する。画面上の角度にするため縦の傾きを引き伸ばす
    let angle = Math.atan2(gy * cellAspect, gx) + Math.PI / 2;
    angle = ((angle % Math.PI) + Math.PI) % Math.PI;
    const bucket = Math.round(angle / (Math.PI / 4)) % 4;
    return EDGE_CHARS[bucket];
  });
}
