# Instant Photo Remaster

スマホで撮影またはアップロードした白枠フォトを、ブラウザ内で傾き補正・色補正・高画質化風処理・保存まで行う Next.js アプリです。

## 使い方

1. 「カメラで撮影」または「画像をアップロード」から JPEG / PNG / WebP / HEIC を選びます。
2. 自動検出された四隅が白枠の外側に合っているか確認します。ずれている場合は丸いハンドルをドラッグして調整します。
3. 「台形補正する」を押します。
4. 補正モードを選びます。
   - 自然補正: 雰囲気を残して自然に整えます。
   - くっきり補正: コントラストとシャープを強め、SNS向けに整えます。
   - やわらか補正: 淡い色と空気感を残します。
   - レトロ補正: 暖色、浮いた黒、粒状感を少し加えます。
5. 「白枠込み」または「写真部分のみ」を選びます。写真部分のみの場合は余白スライダーで微調整できます。
6. Before / After を確認し、「補正後画像を保存」から JPEG で保存します。

補正エンジンは3種類あります。

- ローカル高速補正: 最も軽く、ブラウザ内だけで処理します。
- スマホ内AI風補正: 写真を送信せず、端末内でノイズ低減、2倍拡大、輪郭の再強調を行います。標準 / 高品質 / 最高品質を選べます。重いAIモデルは使わない軽量な推定補正です。
- AI高画質化: 明示的な同意後にサーバーへ写真を送信し、サーバー側で補正します。

## 技術構成

- Next.js App Router
- TypeScript
- Tailwind CSS
- Canvas API によるローカル画像処理
- PWA manifest 対応
- HEIC / HEIF のブラウザ内JPEG変換には MIT ライセンスの `heic2any` を使用

ローカル高速補正またはスマホ内AI風補正を選んだ場合、選択した写真は外部サーバーに送信しません。AI高画質化を選んだ場合のみ、明示的な同意後にAIサーバーへ送信します。

## 画像処理パイプライン

主要な処理は `lib/image` に分離しています。

- `loadImageFile()` / `resizeForProcessing()`: 画像読み込みと最大辺 2400px 程度への縮小
- `detectInstantPhotoFrame()`: 白っぽい大きな領域を簡易検出し、四隅候補を作成
- `perspectiveTransform()`: 四隅から射影変換して正面化
- `cropInnerPhoto()`: 白枠込み画像から写真部分を推定切り出し
- `applyEnhancementPreset()`: 明るさ、コントラスト、ホワイトバランス、彩度、暗部、ハイライト、ノイズ低減、シャープ化
- `upscaleImage()`: Canvas の高品質リサイズによる 2 倍出力と軽いシャープ
- `enhanceOnDevice()`: スマホ内で動く軽量なAI風補正。エッジを保ったノイズ低減、段階的2倍拡大、局所ディテール強調を行います。
- `exportImage()`: JPEG 保存

画像入力ではDataURLではなくObjectURLを使い、HEIC / HEIFはブラウザ内でJPEGへ変換してから処理します。20MBを超える画像は警告を表示し、読み込みに失敗した場合は形式変換や画像縮小を案内します。

## 白枠検出と手動調整

初期検出は OpenCV.js なしの軽量ヒューリスティックです。ブラウザ内で画像を縮小し、画像ごとの明るさ分布から p70 / p80 / p90 / p95 を計算して、白判定のしきい値を自動調整します。

検出は複数方式で候補を作り、最終スコアで採用します。

- `white-region`: `strict` / `tolerant` / `dark` の複数白マスクパス。影でグレーになった白枠、暖色照明で黄ばんだ白枠、暗く撮られた白枠を拾いやすくするため、brightness、chroma、warmth、whiteness score を組み合わせています。白マスクには軽い close 処理をかけ、小さな途切れや穴をつなぎます。
- `inner-photo`: 白枠そのものではなく、内側の写真領域らしい暗い/色のある中央矩形を探し、インスタント写真の余白比率を使って外枠を逆算します。白枠がサイン、影、反射で分断される写真で効きやすい方式です。
- `edge-line`: 画像周辺の明度差・彩度差が強い縦横の境界線を探し、外周4辺に近い矩形を作ります。斜め撮影に完全対応するものではありませんが、手動調整の初期位置を改善するための補助候補です。

候補は、連結領域の大きさ、中央寄りかどうか、インスタント写真らしい縦横比、画像端への張り付き、外側と内側の輝度差、白枠リングらしさでスコアリングします。白い机や紙など背景全体を拾わないよう、画像端に大きく接する領域や面積が大きすぎる領域は強く減点します。

斜めに撮られた白枠フォトに対しては、白領域内の分布から左上・右上・右下・左下の極点を推定します。検出 confidence が低い場合は、画面上に確認メッセージを出します。

自動検出は背景が白い、反射が強い、白飛びしている、白枠が画面外にはみ出している、影が極端に強い、黄ばみが強すぎる、といった条件では外れることがあります。その場合でも、四隅調整画面で手動修正できます。スマホで操作しやすいように、拡大調整モード、大きなタッチ領域、選択中の角表示、1px / 5px の微調整ボタンを用意しています。

四隅調整画面の「検出デバッグ」を開くと、method、strategy、confidence、候補数、best score、white-region score、inner-photo score、edge-line score、面積比、縦横比、端への接触数、白枠リングらしさ、内側写真領域の矩形、白マスクプレビューを確認できます。自動検出が外れる写真を改善するときは、この表示でどの検出方式が選ばれたかを確認してください。

今後さらに精度が必要な場合は、OpenCV.js の contour / approxPolyDP、または軽量なAIセグメンテーションを検出パイプラインへ追加できます。ただし、初期版では壊れにくさとブラウザ内処理を優先しています。

## 台形補正

四隅は補正前に左上・右上・右下・左下へ並び替えます。四角形が交差している場合、角同士が近すぎる場合、極端に潰れている場合は、分かりやすい日本語エラーを表示して処理を止めます。

## 制限事項

- HEIC / HEIF はブラウザ内でJPEGへ変換して処理します。ただし、端末やブラウザ、HEICの種類によって変換に失敗する場合があります。その場合はiPhone側でJPEGとして共有するか、JPEG / PNGへ変換してください。
- 白枠自動検出は OpenCV なしの軽量実装です。白背景、反射、暗い撮影、強い黄ばみでは外れる場合がありますが、手動四隅調整で完了できます。
- 顔復元AIは未実装です。将来追加する場合は、本人の顔が変わる可能性について明示したうえで導入します。
- Service Worker は未実装です。manifest によるホーム画面追加の見た目を優先しています。

## AI超解像の追加方針

### ローカル補正

- ブラウザ内で処理します。
- 写真は外部送信されません。
- 高速ですが、AI復元ではありません。

### スマホ内AI風補正

- ブラウザ内で処理します。
- 写真は外部送信されません。
- サーバー不要でスマホだけで使えます。
- 現在はWebGPUやONNXモデルを使う本物のニューラル超解像ではなく、Canvas上の軽量な推定補正です。
- 処理内容は、補正プリセット、エッジ保持ノイズ低減、段階的2倍リサイズ、局所ディテール強調です。
- 端末性能に依存します。古いスマホや大きい画像ではローカル高速補正より時間がかかる場合があります。
- 最高品質で出力予定サイズが大きすぎる場合は、高品質へ自動フォールバックします。

スマホ内AI風補正には3つの品質があります。

- `standard`: 高速です。軽めのノイズ低減とディテール補正を行います。古いスマホ向けです。
- `high`: おすすめです。解像感と自然さのバランスを取り、エッジを保ったノイズ低減、段階的な2倍拡大、局所ディテール強調を行います。
- `max`: 画質優先です。追加のノイズ低減とディテール補正を行うため、スマホによっては少し時間がかかります。最終出力の最大辺は端末負荷を抑えるため最大 3600px 程度に制限します。

### AI補正PoC

AI高画質化はPoCとして実装されています。ユーザーが同意チェックをオンにした場合のみ、写真をサーバーへ送信します。

スマホ公開版では、GitHub Pagesの静的フロントエンドからRender無料枠のFastAPIサーバーへ直接送信する構成にしています。

```text
GitHub Pages Frontend -> FastAPI AI server on Render -> Frontend
```

サーバー側では画像をディスクに保存せず、メモリ上で処理します。現在のAIサーバーはPillowによるダミー補正です。2倍リサイズ、軽いコントラスト、彩度、シャープ処理を行います。

AI補正リクエストには120秒のタイムアウトを設定しています。Render無料枠は一定時間アクセスがないとスリープするため、初回は起動待ちで最大1分ほどかかる場合があります。タイムアウト、接続失敗、アクセスコード違い、画像サイズ超過、サーバー内部エラーはUI上で分けて表示します。

AIサーバー側の入力制限:

- アップロード最大サイズ: 10MB
- 最大画素数: 16MP
- 最大辺: 5000px
- 対応形式: JPEG / PNG / WebP

失敗した場合は、少し待って再実行する、アクセスコードを確認する、画像を縮小する、またはローカル高速補正 / スマホ内AI風補正を使ってください。

AI超解像は `lib/image/upscale.ts` の `upscaleImage()`、または `lib/image/aiEnhance.ts` の `enhanceWithAI()` / `ai-server/app/processors` を差し替える形で追加できます。

スマホ完結の本格AIを入れる場合は、`lib/image/deviceEnhance.ts` の `enhanceOnDevice()` を WebGPU / WebNN / ONNX Runtime Web などの推論処理へ置き換えるのが差し込みポイントです。ただし、モバイルSafari対応、モデルサイズ、初回ロード時間、メモリ使用量、商用ライセンス確認が課題になります。

候補として以下があります。

- Real-ESRGAN: 汎用超解像 / 復元
- GFPGAN: 顔復元。ただし商用利用時は第三者コンポーネントのライセンス確認が必要
- InstantIR: より強い画像復元候補。ただし依存モデル / 重みライセンス確認が必要
- SwinIR: 汎用的な復元 / ノイズ低減候補

サーバーAI補正を使う場合、画像が外部サーバーへ送信されます。そのため、UI上で外部送信の有無、保存しない設計、利用モデルの性質、顔が変わる可能性を明示し、ユーザーの明示的な同意を取る必要があります。

Real-ESRGANは候補ですが、モデル本体、重み、依存ライブラリのライセンス確認が必要です。GPU推奨です。CPUでも動く可能性はありますが、非常に遅い可能性があります。

## 開発

```bash
npm install
npm run dev
npm run lint
npm run build
```

## 無料枠サーバー Render

`render.yaml` を追加しているため、RenderのBlueprintとしてこのGitHubリポジトリを接続すると、`instant-photo-remaster-ai` というPython Web Serviceを作成できます。

想定URL:

```text
https://instant-photo-remaster-ai.onrender.com/enhance
```

GitHub Pagesのビルドでは `NEXT_PUBLIC_AI_ENHANCE_ENDPOINT` にこのURLを設定しています。Render側のURLやサービス名を変える場合は、`.github/workflows/pages.yml` の環境変数も合わせて変更してください。

Renderの無料Web Serviceは検証・趣味用途向けです。一定時間アクセスがないとスリープするため、初回AI補正は起動待ちで遅くなることがあります。

## 課金PoC

AI高画質化は、最初は「無料ベータ」または「手動発行のアクセスコード」で運用できます。

- Stripe Payment Links を作成します。
- GitHub repository variables に以下を設定します。
  - `STRIPE_PACK_10_URL`
  - `STRIPE_PACK_30_URL`
  - `STRIPE_PACK_100_URL`
- GitHub Pagesを再ビルドすると、AI高画質化UIに購入ボタンが表示されます。
- Renderの環境変数 `AI_ACCESS_CODES` にカンマ区切りでコードを設定すると、AIサーバーはそのコードを持つリクエストだけ受け付けます。
- GitHub Pagesのビルドでは `NEXT_PUBLIC_AI_ACCESS_CODE_REQUIRED=true` を設定しています。AIアクセスコードが空欄の場合は、サーバーへ送信する前にフロント側でエラーを表示します。コードが間違っている場合やRender側で無効なコードとして拒否された場合も、専用のエラー文言を表示します。

このPoCはDBなしの簡易ゲートです。チケット残数の自動消費、ユーザーアカウント、Stripe Webhookによる自動付与は未実装です。本番課金では、Stripe Checkout + Webhook + DBで残回数を管理してください。

## AIサーバー起動方法 macOS / Linux

```bash
cd ai-server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Next.js側は環境変数を指定して起動します。ローカル開発ではFastAPIを直接呼びます。

```bash
NEXT_PUBLIC_AI_ENHANCE_ENDPOINT=http://localhost:8001/enhance npm run dev
```

## AIサーバー起動方法 Windows PowerShell

```powershell
cd ai-server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Next.js側:

```powershell
$env:NEXT_PUBLIC_AI_ENHANCE_ENDPOINT="http://localhost:8001/enhance"
npm run dev
```

## Docker Compose

```bash
docker compose up
```

Next.js frontend と Python ai-server を同時に起動します。

## 注意

GitHub Pagesは静的ホスティングなので、サーバー処理は実行できません。そのためAI高画質化は外部のFastAPIサーバーへ送信します。AIサーバーが未デプロイ、スリープ中、または失敗している場合は、ローカル高速補正を使ってください。
