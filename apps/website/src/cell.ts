/** 実測できなかったときに使う値（ターミナルの慣習） */
export const FALLBACK_CELL_ASPECT = 2;

/**
 * 等幅フォント1文字の実際の縦横比（高さ ÷ 幅）を測る。
 *
 * `cellAspect` は「1マスが元画像のどれだけを受け持つか」なので、
 * HTML として文字で描くときは実際の文字セルと一致していないと絵が歪む。
 * フォントと `line-height` の組み合わせで変わるため、決め打ちにせず測る。
 * 例: `line-height: 1` なら約 1.66、`1.2` なら約 1.99。
 */
export function measureCellAspect(container: HTMLElement): number {
  const cols = 20;
  const rows = 4;
  const probe = document.createElement("pre");
  probe.className = "termpic";
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;display:inline-block;width:max-content";
  probe.textContent = Array.from({ length: rows }, () => "▀".repeat(cols)).join("\n");

  container.append(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();

  const cellWidth = rect.width / cols;
  const cellHeight = rect.height / rows;
  if (cellWidth <= 0 || cellHeight <= 0) return FALLBACK_CELL_ASPECT;
  return cellHeight / cellWidth;
}
