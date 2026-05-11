export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-5 py-8 text-ink">
      <article className="mx-auto max-w-2xl rounded-[8px] border border-zinc-200 bg-white p-5 shadow-soft">
        <a href="../" className="text-sm font-bold text-accent underline underline-offset-4">
          Instant Photo Remaster に戻る
        </a>
        <h1 className="mt-5 text-3xl font-bold">Privacy</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-700">
          Instant Photo Remaster は公開PoCです。ローカル補正とスマホ内AI風補正では、選択した写真を外部サーバーへ送信しません。
        </p>

        <h2 className="mt-6 text-lg font-bold">写真の送信</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-700">
          AI高画質化を選んだ場合のみ、ユーザーの同意後に写真をRender上のAIサーバーへ送信します。サーバーでは画像を永続保存せず、メモリ上で処理して結果画像を返します。
        </p>

        <h2 className="mt-6 text-lg font-bold">ログとアクセスコード</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-700">
          Renderなどのホスティング基盤側にはアクセスログが残る可能性があります。AIアクセスコードはPoC用の簡易ゲートであり、本格的な課金・認証・残回数管理ではありません。
        </p>

        <h2 className="mt-6 text-lg font-bold">今後のAIモデル</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-700">
          本物のAI復元モデルを導入する場合は、処理内容、保存方針、顔が変わる可能性、利用モデルのライセンスを確認し、このページとUI表示を更新します。
        </p>

        <h2 className="mt-6 text-lg font-bold">問い合わせ</h2>
        <p className="mt-2 text-sm leading-7 text-zinc-700">
          問題や質問はGitHub Issuesで受け付けます。
        </p>
      </article>
    </main>
  );
}
