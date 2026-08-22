import { expect, test } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import "../../src/style.css";
import { mount } from "../../src/app.ts";

function render(): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  mount(root);
}

test("初期表示でサンプル画像が変換される", async () => {
  render();
  await expect.element(page.getByText(/60 × 30 マス/)).toBeVisible();
  expect(document.querySelectorAll(".preview .termpic span").length).toBeGreaterThan(10);
});

test("マス数を変えると行数も変わる", async () => {
  render();
  await page.getByLabelText("横のマス数").fill("40");
  await expect.element(page.getByText(/40 × 20 マス/)).toBeVisible();
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
  await expect.element(page.getByText(/60 × 30 マス/)).toBeVisible();
  // 出力そのものが色なので、数値の検査では「正しい色で描けたか」を確認できない
  await expect
    .element(page.getByRole("img", { name: "変換結果のプレビュー" }))
    .toMatchScreenshot("preview");
});
