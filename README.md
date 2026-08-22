# termpic

画像をターミナルの絵に変換するライブラリと Web ツール。Vite+ のモノレポ。

```
packages/termpic   termpic（npm 公開するライブラリ）
apps/website       画像をドロップして変換する Web ツール
```

## 開発

```bash
vp install
vp run website#dev   # Web ツールを起動
vp run -r build      # 先にビルドしないと check が型を解決できない
vp check
vp run -r test
```

ブラウザテストには Chromium が必要。初回だけ `cd apps/website && pnpm exec playwright install chromium`。

## テスト

| 種類    | 場所                         | 内容                                                       |
| ------- | ---------------------------- | ---------------------------------------------------------- |
| unit    | `packages/termpic/tests`     | 合成画像を使った変換の検証。縦横比・濃淡・量子化・誤差拡散 |
| unit    | `apps/website/tests`         | フォームの値の解釈                                         |
| browser | `apps/website/tests/browser` | 実物の Chromium での DOM 操作とビジュアルリグレッション    |

基準画像は撮影プラットフォームごとに別ファイル（`preview-chromium-darwin.png` / `-linux.png`）。見た目を意図的に変えたら、手元で `vp run website#test -u`、Linux 用は `gh workflow run update-screenshots.yml` の artifact を持ち帰ってコミットする。

## 1マスの縦横比について

`cellAspect` は「1マスが元画像のどれだけを受け持つか」で、出力先によって正しい値が違います。ターミナル（`toAnsi`）は 2、HTML は描画フォント次第（`line-height: 1` の等幅フォントで約 1.66）。SVG はどの値でも比率が保たれます。

Web ツールは決め打ちにせず、`measureCellAspect()` でプレビューの実際の文字セルを測って初期値にしています。

## デプロイ

`apps/website` は Cloudflare Workers の静的アセットとして配信する。main にマージされると CI が自動でデプロイする。

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo finalize/termpic
gh secret set CLOUDFLARE_ACCOUNT_ID --repo finalize/termpic
```

## ライブラリ

[packages/termpic/README.md](packages/termpic/README.md) を参照。
