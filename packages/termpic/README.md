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

## 設計のポイント

**マスの縦横比。** 等幅フォントの1文字は横1・縦2くらいの縦長です。1マスが受け持つのは横 `blockW`・縦 `blockW * cellAspect` ピクセルで、これを 1 にすると出力が縦に間延びします。円が円のまま出ることをテストで固定しています。

**濃淡の割り当てには知覚的な明度を使う。** WCAG の相対輝度は線形光なので、そのまま等間隔の文字ランプに割り当てると暗部に偏ります（中間グレーが 0.216）。contrast-kit の `toOklab().L`（中間グレーで 0.60）を使っています。

**HTML は同じ色が続く区間をまとめる。** SVG も横に続く同色の矩形を1つにまとめるので、平坦な部分が多い画像では出力が10分の1近くまで縮みます。

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
