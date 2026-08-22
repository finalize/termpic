import type { Grid } from "./convert.ts";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]!);
}

/** 同じ見た目が続くマスをまとめた区間 */
interface Run {
  text: string;
  fg: string;
  bg?: string;
}

function runsOfRow(grid: Grid, row: number): Run[] {
  const runs: Run[] = [];
  for (let col = 0; col < grid.cols; col++) {
    const cell = grid.cells[row * grid.cols + col]!;
    const last = runs.at(-1);
    if (last && last.fg === cell.fg && last.bg === cell.bg) {
      last.text += cell.char;
    } else {
      runs.push({ text: cell.char, fg: cell.fg, bg: cell.bg });
    }
  }
  return runs;
}

/** ascii モードの出力を素のテキストにする。行末の空白は落とす */
export function toText(grid: Grid): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = "";
    for (let col = 0; col < grid.cols; col++) {
      line += grid.cells[row * grid.cols + col]!.char;
    }
    lines.push(line.replace(/\s+$/u, ""));
  }
  return lines.join("\n");
}

export interface HtmlOptions {
  /** <pre> に付けるクラス名。既定 "termpic" */
  className?: string;
  /** 読み上げ用の説明。指定すると role="img" と aria-label が付く */
  alt?: string;
}

/**
 * `<pre>` にまとめた HTML を返す。
 * 同じ色が続くマスは1つの `<span>` にまとめるので、出力はマス数よりずっと小さくなる。
 */
export function toHtml(grid: Grid, options: HtmlOptions = {}): string {
  const body = Array.from({ length: grid.rows }, (_, row) =>
    runsOfRow(grid, row)
      .map((run) => {
        const style = run.bg ? `color:${run.fg};background:${run.bg}` : `color:${run.fg}`;
        return `<span style="${style}">${escapeHtml(run.text)}</span>`;
      })
      .join(""),
  ).join("\n");

  const attributes = [`class="${escapeHtml(options.className ?? "termpic")}"`];
  if (options.alt !== undefined) {
    attributes.push(`role="img"`, `aria-label="${escapeHtml(options.alt)}"`);
  }
  return `<pre ${attributes.join(" ")}>${body}</pre>`;
}

export interface SvgOptions {
  /** 1マスの幅（px）。高さは cellAspect 倍になる。既定 8 */
  cellSize?: number;
  alt?: string;
}

/**
 * SVG を返す。
 *
 * halfblock モードは矩形だけで描くのでフォントに依存しない。
 * ascii モードは文字を使うため等幅フォントを指定し、行ごとに `textLength` で
 * 幅を固定して、環境によるフォントの差で崩れないようにしている。
 */
export function toSvg(grid: Grid, options: SvgOptions = {}): string {
  const cellW = options.cellSize ?? 8;
  const cellH = cellW * grid.cellAspect;
  const width = grid.cols * cellW;
  const height = grid.rows * cellH;

  const parts: string[] = [];

  if (grid.mode === "halfblock") {
    const halfH = cellH / 2;
    // 横に続く同じ色は1つの矩形にまとめる。平坦な部分が多い画像では出力が大きく縮む
    const emitRow = (colorAt: (col: number) => string, y: number): void => {
      let start = 0;
      for (let col = 1; col <= grid.cols; col++) {
        if (col < grid.cols && colorAt(col) === colorAt(start)) continue;
        const width = (col - start) * cellW;
        parts.push(
          `<rect x="${start * cellW}" y="${y}" width="${width}" height="${halfH}" fill="${colorAt(start)}"/>`,
        );
        start = col;
      }
    };

    for (let row = 0; row < grid.rows; row++) {
      const cellAt = (col: number) => grid.cells[row * grid.cols + col]!;
      emitRow((col) => cellAt(col).fg, row * cellH);
      emitRow((col) => cellAt(col).bg ?? cellAt(col).fg, row * cellH + halfH);
    }
  } else {
    for (let row = 0; row < grid.rows; row++) {
      const spans = runsOfRow(grid, row)
        .map((run) => `<tspan fill="${run.fg}">${escapeHtml(run.text)}</tspan>`)
        .join("");
      const baseline = row * cellH + cellH * 0.78;
      parts.push(
        `<text x="0" y="${baseline}" textLength="${width}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${spans}</text>`,
      );
    }
  }

  const label = options.alt === undefined ? "" : `<title>${escapeHtml(options.alt)}</title>`;
  const fontStyle =
    grid.mode === "ascii"
      ? ` font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="${cellH * 0.9}"`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"${fontStyle}>${label}${parts.join("")}</svg>`;
}

function ansiColor(hex: string, layer: 38 | 48): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `\u001b[${layer};2;${r};${g};${b}m`;
}

/** そのままターミナルに貼れる ANSI エスケープ付きの文字列 */
export function toAnsi(grid: Grid): string {
  const lines: string[] = [];
  for (let row = 0; row < grid.rows; row++) {
    let line = "";
    for (const run of runsOfRow(grid, row)) {
      line += ansiColor(run.fg, 38);
      if (run.bg !== undefined) line += ansiColor(run.bg, 48);
      line += run.text;
    }
    lines.push(`${line}\u001b[0m`);
  }
  return lines.join("\n");
}
