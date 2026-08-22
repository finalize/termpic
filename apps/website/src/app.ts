import type { Bitmap, Grid } from "termpic";
import { convert, toAnsi, toHtml, toSvg, toText } from "termpic";
import { readBitmap, sampleBitmap } from "./image.ts";
import { toConvertOptions } from "./options.ts";
import type { FormValues } from "./options.ts";

const FORMATS = ["html", "svg", "text", "ansi"] as const;
type Format = (typeof FORMATS)[number];

const PREVIEW_CSS = `.termpic {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1;
  letter-spacing: 0;
  white-space: pre;
}`;

export function mount(root: HTMLElement): void {
  root.innerHTML = `
<header class="site-header">
  <h1>termpic</h1>
  <p>画像をターミナルの絵に変えます。文字なので、拡大しても選択してもテキストのままです。</p>
</header>

<main>
  <section class="panel">
    <label class="drop" for="file">
      <input id="file" type="file" accept="image/*" />
      <span>画像を選ぶか、ここにドロップ</span>
    </label>
  </section>

  <section class="panel options">
    <div class="field">
      <label for="mode">描き方</label>
      <select id="mode">
        <option value="halfblock">半ブロック（上下2色のマス）</option>
        <option value="ascii">ASCII（濃淡の文字）</option>
      </select>
    </div>
    <div class="field">
      <label for="cols">横のマス数</label>
      <input id="cols" type="number" min="8" max="240" step="1" value="60" />
    </div>
    <div class="field">
      <label for="palette">色</label>
      <select id="palette">
        <option value="original">元の色のまま</option>
        <option value="site">サイトの8色に寄せる</option>
      </select>
    </div>
    <div class="field">
      <label for="dither">誤差拡散</label>
      <select id="dither">
        <option value="false">なし</option>
        <option value="true">あり</option>
      </select>
    </div>
    <div class="field">
      <label for="background">置く背景</label>
      <select id="background">
        <option value="dark">暗い背景</option>
        <option value="light">明るい背景</option>
      </select>
    </div>
  </section>

  <section class="panel" aria-labelledby="preview-heading">
    <h2 id="preview-heading">プレビュー</h2>
    <p class="meta" id="meta" aria-live="polite"></p>
    <div class="preview" id="preview"></div>
  </section>

  <section class="panel" aria-labelledby="output-heading">
    <h2 id="output-heading">書き出し</h2>
    <div class="tabs" role="tablist">
      ${FORMATS.map(
        (format, index) =>
          `<button type="button" role="tab" data-format="${format}" aria-selected="${index === 0}">${format}</button>`,
      ).join("")}
    </div>
    <textarea id="output" readonly rows="10" spellcheck="false"></textarea>
    <p class="hint" id="hint"></p>
  </section>
</main>

<footer class="site-footer">
  <a href="https://github.com/finalize/termpic">GitHub</a>
  <a href="https://www.npmjs.com/package/termpic">npm</a>
</footer>
`;

  const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const fileInput = $<HTMLInputElement>("file");
  const preview = $<HTMLDivElement>("preview");
  const output = $<HTMLTextAreaElement>("output");
  const meta = $<HTMLParagraphElement>("meta");
  const hint = $<HTMLParagraphElement>("hint");
  const drop = root.querySelector<HTMLLabelElement>(".drop")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-format]")];

  const controls = ["mode", "cols", "palette", "dither", "background"] as const;
  let bitmap: Bitmap = sampleBitmap();
  let format: Format = "html";
  let grid: Grid | undefined;

  const values = (): FormValues => ({
    mode: $<HTMLSelectElement>("mode").value,
    cols: $<HTMLInputElement>("cols").value,
    palette: $<HTMLSelectElement>("palette").value,
    dither: $<HTMLSelectElement>("dither").value,
    background: $<HTMLSelectElement>("background").value,
  });

  const serialize = (target: Grid): string => {
    switch (format) {
      case "svg":
        return toSvg(target, { cellSize: 8, alt: "termpic の出力" });
      case "text":
        return toText(target);
      case "ansi":
        return toAnsi(target);
      default:
        return toHtml(target, { alt: "termpic の出力" });
    }
  };

  const render = (): void => {
    grid = convert(bitmap, toConvertOptions(values()));
    preview.innerHTML = toHtml(grid, { alt: "変換結果のプレビュー" });
    meta.textContent = `${grid.cols} × ${grid.rows} マス（元の画像 ${bitmap.width} × ${bitmap.height}）`;

    const serialized = serialize(grid);
    output.value = serialized;
    hint.textContent =
      format === "html"
        ? `${(serialized.length / 1024).toFixed(1)} KB。貼り付け先には次の CSS が必要です → ${PREVIEW_CSS.replace(/\s+/gu, " ")}`
        : `${(serialized.length / 1024).toFixed(1)} KB`;
  };

  for (const id of controls) {
    $<HTMLElement>(id).addEventListener("input", render);
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      format = (tab.dataset["format"] as Format | undefined) ?? "html";
      for (const other of tabs) other.setAttribute("aria-selected", String(other === tab));
      render();
    });
  }

  const load = async (file: Blob | undefined): Promise<void> => {
    if (!file) return;
    bitmap = await readBitmap(file);
    render();
  };

  fileInput.addEventListener("change", () => void load(fileInput.files?.[0]));

  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("is-over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    void load(event.dataTransfer?.files?.[0]);
  });

  render();
}
