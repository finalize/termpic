# termpic

画像をターミナルの絵に変換する。ASCII の濃淡、半ブロックの色マス、パレット量子化に対応。依存は [contrast-kit](https://www.npmjs.com/package/contrast-kit) のみ。

```bash
npm i termpic
```

```ts
import { convert, toHtml, toSvg, toText, toAnsi } from "termpic";

// bitmap は { width, height, data }（ブラウザの ImageData と同じ形）
const grid = convert(bitmap, { mode: "halfblock", cols: 60 });

toHtml(grid, { alt: "自画像" }); // <pre> と <span>
toSvg(grid, { cellSize: 8 }); // 矩形だけの SVG（フォント非依存）
toText(grid); // 素のテキスト（ascii モード向け）
toAnsi(grid); // そのままターミナルに貼れる
```

## オプション

|              | 既定           | 説明                                               |
| ------------ | -------------- | -------------------------------------------------- |
| `mode`       | `"halfblock"`  | `ascii` は濃淡の文字、`halfblock` は1マスに上下2色 |
| `cols`       | `60`           | 横のマス数                                         |
| `ramp`       | `" .:-=+*#%@"` | ascii の濃淡ランプ（薄い → 濃い）                  |
| `palette`    | なし           | 渡すとその色だけに量子化する                       |
| `dither`     | `false`        | 量子化時に誤差拡散（Floyd–Steinberg）              |
| `cellAspect` | `2`            | 等幅フォント1文字の縦横比（高さ ÷ 幅）             |
| `background` | `"dark"`       | 置く背景。`light` では濃淡が反転する               |

## 描き方

| モード      | 1マスの分割 | 色          | 向いているもの                 |
| ----------- | ----------- | ----------- | ------------------------------ |
| `ascii`     | 1x1         | 文字色のみ  | 文字として貼りたいとき         |
| `halfblock` | 1x2         | 上下2色     | 汎用。既定                     |
| `quadrant`  | 2x2         | 明暗2色     | 横の解像度がほしいとき         |
| `braille`   | 2x4         | 点と地の2色 | 最も細かい。輪郭がはっきり出る |

`quadrant` は、4つの小マスの明度差が小さいマスを単色で塗ります。差が無いのに明暗2色に分けると、平坦な面に無意味な模様が出るためです（実写真で測ると閾値 0.03 でちょうど無くなります）。

`braille` は 1 マスに 2x4 の点を持てるので `halfblock` の4倍の解像度になります。点の有無は**画像全体の平均の明度**で決めます。マスごとの中間値で切ると、一様なマスが必ず全点灯になって図地が反転するためです。点の色に加えて点が付かない側の平均も背景色として持たせているので、写真でも図地が反転しません。

## 画像から色を抽出する

決め打ちのパレットに落とすと、そこに無い色（茶色など）が破綻します。画像自身から代表色を求められます。

```ts
import { convert, extractPalette } from "termpic";

const palette = extractPalette(bitmap, 16);
convert(bitmap, { palette });
```

中央値分割法です。色空間の直方体を最も幅の広い軸の中央値で切る操作を、箱が指定数になるまで繰り返します。画像の色数が要求より少ない場合は、重複を除いた色数だけを返します。

## 輪郭を拾う

```ts
convert(bitmap, { mode: "ascii", edges: true });
```

Sobel フィルタでマス目の明度の傾きを取り、輪郭が強いマスに向きの文字を割り当てます。マスは縦長なので、画面上の角度に直すために縦方向の傾きへ `cellAspect` を掛けています。これを忘れると斜めの輪郭がすべて縦寄りに倒れます。

## 設計のポイント

**マスの縦横比は出力先で変わる。** 1マスが受け持つのは横 `blockW`・縦 `blockW * cellAspect` ピクセルです。既定の `2` は**ターミナルの比率**（行間込みで文字セルが縦2倍）で、`toAnsi` の出力にはこれが正しい値です。

ところが HTML として文字で描く場合、実際の文字セルはフォントと `line-height` で決まります。Chromium で実測すると:

|                    | 1文字の大きさ  | 縦横比   |
| ------------------ | -------------- | -------- |
| `line-height: 1`   | 9.63 × 16.00px | **1.66** |
| `line-height: 1.2` | 9.63 × 19.19px | 1.99     |

半ブロックは行間があるとマスのあいだに隙間が出るので `line-height: 1` が必要で、そのとき実際の比率は 1.66 です。ここを 2 のままにすると、絵は本来の 83% の高さで描かれて横に潰れます。**HTML に出すときは、描画に使うフォントの実測値を渡してください。**

SVG は矩形を `cellAspect` 倍の高さで描くので自己完結していて、どの値でも比率は保たれます（マス目の粗さが変わるだけ）。

円が円のまま出ることは、合成画像を使ったテストで固定しています。

**濃淡の割り当てには知覚的な明度を使う。** WCAG の相対輝度は線形光なので、そのまま等間隔の文字ランプに割り当てると暗部に偏ります（中間グレーが 0.216）。contrast-kit の `toOklab().L`（中間グレーで 0.60）を使っています。

**HTML は同じ色が続く区間をまとめる。** SVG も横に続く同色の矩形を1つにまとめるので、平坦な部分が多い画像では出力が10分の1近くまで縮みます。

## テーマに追従させる

出力する色を CSS 変数に差し替えられます。役割（変数名）で色を持つので、ライト/ダークでトークンの値が入れ替わるサイトなら、絵もテーマの切り替えに追従します。画像ではできない振る舞いです。

```ts
import { convert, cssVariablePalette, toSvg } from "termpic";

const { palette, colors } = cssVariablePalette({
  "--bg": "#0b0e0f",
  "--fg": "#cfd8d3",
  "--accent": "#7ee787",
});

const grid = convert(bitmap, { palette, dither: true });
toSvg(grid, { colors }); // fill="var(--accent)" が出る
```

`toAnsi` は実際の色の数値が要るので差し替えません。

## 貼り付け先に必要な CSS

```css
.termpic {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  line-height: 1;
  letter-spacing: 0;
  white-space: pre;
}
```

`line-height: 1` を入れないと、半ブロックのマスのあいだに隙間が出ます。
