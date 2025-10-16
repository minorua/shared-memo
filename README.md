# 共有メモ

シンプルなオフライン対応の共有メモWebアプリです。PCやスマートフォンでメモを取って、ローカルストレージに保存します。メニューからFirebaseへの同期やローカルファイル保存ができます。

使い方

1. `index.html` をブラウザで開きます（ファイルを直接開いても動作します）。
2. ヘッダのタイトル（初期は「共有メモ」）は編集可能です。
3. メモを入力して「追加」を押すとローカルストレージに保存されます。
4. メモは作成日時の新しい順に表示されます。30件を超えると初期表示は30件で、下の「すべて表示」で全てを表示できます。
5. メニューから「同期」でFireStoreにアップロードできます。Firebaseの設定は`firebase-config.js`を作成して、ページに読み込んでください（`firebase-config.example.js`を参照）。
6. 「ファイル保存」でローカルのメモをJSONファイルとしてダウンロードできます。

オフライン

アプリシェルはService Workerでキャッシュするため、ネットワークオフラインでも表示・追加が可能です。ただしFirebase同期はネット接続が必要です。

Firebase設定

プロジェクトのFirebase設定を `firebase-config.js` に置き、次のように `firebaseConfig` を定義して下さい：

```
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // ...
}
```

次に `firebase.initializeApp(firebaseConfig)` を実行するか、そのまま `firebase-config.js` を読み込んでください。

開発

Windows PowerShellでローカルサーバを使う場合（一時的にHTTPでサービスワーカーを試すにはHTTPが必要）：

```powershell
python -m http.server 8000
# または
npx http-server -p 8000
```

次にブラウザで `http://localhost:8000` を開いてください。
