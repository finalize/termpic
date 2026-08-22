import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import "../../src/style.css";
import { mount } from "../../src/app.ts";
import { measureCellAspect } from "../../src/cell.ts";

function render(): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  mount(root);
}

test("文字セルの縦横比を実測する", () => {
  render();
  // line-height: 1 の等幅フォントでは、文字は縦長だが 2 倍まではいかない。
  // ここを 2 のままにすると、HTML として描いたときに絵が横に潰れる
  const aspect = measureCellAspect(document.querySelector<HTMLElement>(".preview")!);
  expect(aspect).toBeGreaterThan(1.4);
  expect(aspect).toBeLessThan(1.9);
});

test("初期表示でサンプル画像が変換される", async () => {
  render();
  await expect.element(page.getByText(/60 × 36 マス/)).toBeVisible();
  expect(document.querySelectorAll(".preview .termpic span").length).toBeGreaterThan(10);
});

test("マス数を変えると行数も変わる", async () => {
  render();
  await page.getByLabelText("横のマス数").fill("40");
  await expect.element(page.getByText(/40 × 24 マス/)).toBeVisible();
});

test("ASCII に切り替えると span の中身が文字になる", async () => {
  render();
  await page.getByLabelText("描き方").selectOptions("ascii");
  const text = document.querySelector(".preview .termpic")!.textContent!;
  expect(text).toMatch(/[.:\-=+*#%@]/u);
  expect(text).not.toContain("▀");
});

test("書き出し形式を切り替えると内容が変わる", async () => {
  render();
  await page.getByRole("tab", { name: "svg" }).click();
  const output = document.querySelector<HTMLTextAreaElement>("#output")!;
  expect(output.value.startsWith("<svg")).toBe(true);
});

test("プレビューの見た目が変わっていない", async () => {
  render();
  await expect.element(page.getByText(/60 × 36 マス/)).toBeVisible();
  // 出力そのものが色なので、数値の検査では「正しい色で描けたか」を確認できない
  await expect
    .element(page.getByRole("img", { name: "変換結果のプレビュー" }))
    .toMatchScreenshot("preview");
});
