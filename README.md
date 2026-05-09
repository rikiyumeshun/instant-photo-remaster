# Instant Photo Remaster

スマホで撮影またはアップロードした白枠フォトを、ブラウザ内で傾き補正・色補正・高画質化風処理・保存まで行う Next.js アプリです。

## 使い方

1. 「カメラで撮影」または「画像をアップロード」から JPEG / PNG / WebP を選びます。
2. 自動検出された四隅が白枠の外側に合っているか確認します。ずれている場合は丸いハンドルをドラッグして調整します。
3. 「台形補正する」を押します。
4. 補正モードを選びます。
   - 自然補正: 雰囲気を残して自然に整えます。
   - くっきり補正: コントラストとシャープを強め、SNS向けに整えます。
   - やわらか補正: 淡い色と空気感を残します。
   - レトロ補正: 暖色、浮いた黒、粒状感を少し加えます。
5. 「白枠込み」または「写真部分のみ」を選びます。写真部分のみの場合は余白スライダーで微調整できます。
6. Before / After を確認し、「補正後画像を保存」から JPEG で保存します。

## 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- Canvas API によるローカル画像処理
- PWA manifest 対応

選択した写真は外部サーバーに送信しません。処理はブラウザ内の Canvas で行います。

## 画像処理パイプライン

主要な処理は `lib/image` に分離しています。

- `loadImageFile()` / `resizeForProcessing()`: 画像読み込みと最大辺 2400px 程度への縮小
- `detectInstantPhotoFrame()`: 白っぽい大きな領域を簡易検出し、四隅候補を作成
- `perspectiveTransform()`: 四隅から射影変換して正面化
- `cropInnerPhoto()`: 白枠込み画像から写真部分を推定切り出し
- `applyEnhancementPreset()`: 明るさ、コントラスト、ホワイトバランス、彩度、暗部、ハイライト、ノイズ低減、シャープ化
- `upscaleImage()`: Canvas の高品質リサイズによる 2 倍出力と軽いシャープ
- `exportImage()`: JPEG 保存

## 制限事項

- HEIC は初期版では対象外です。ブラウザが直接読める JPEG / PNG / WebP を使ってください。
- 白枠自動検出は OpenCV なしの軽量実装です。背景や照明によって外れる場合がありますが、手動四隅調整で完了できます。
- 顔復元AIは未実装です。将来追加する場合は、本人の顔が変わる可能性について明示したうえで導入します。
- Service Worker は未実装です。manifest によるホーム画面追加の見た目を優先しています。

## AI超解像の追加方針

AI超解像は `lib/image/upscale.ts` の `upscaleImage()` を差し替える形で追加できます。

候補として Real-ESRGAN、GFPGAN、SwinIR などをサーバー側またはネイティブ側に置く設計が考えられます。ただし、商用利用時はモデルと重みのライセンスを必ず確認してください。また、サーバー処理を使う場合は、写真を外部送信する旨と保存しない設計を UI と README に明記してください。

## 開発

```bash
npm install
npm run lint
npm run build
```

## GitHub Pages で公開

このリポジトリは GitHub Actions で静的サイトを書き出して GitHub Pages に公開できます。

1. GitHub にリポジトリを作成します。
2. `main` ブランチへ push します。
3. GitHub の `Settings > Pages` で Source を `GitHub Actions` にします。
4. `Deploy to GitHub Pages` workflow が完了すると Pages URL が発行されます。

GitHub Pages ビルド時はリポジトリ名に合わせて `basePath` を自動設定します。Vercel や独自ドメインで公開する場合は通常の `npm run build` で動きます。
