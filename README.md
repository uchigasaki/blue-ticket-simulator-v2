# 自転車青切符ルール診断 Web版プロトタイプ v3

## 内容
この版は，事前アンケート，シミュレーション，診断結果，事後アンケートまでを静的サイトで扱う研究用プロトタイプです。
1週間後アンケートはGoogle Form連携を基本にします。

## 使い方
1. `index.html` をブラウザで開く
2. 言語を選択する
3. 参加者IDを入力する
   - 本名は入力しない
   - 英字4文字＋数字2桁（例：BIKE33，NEKO12，STAR07）
4. メールアドレスは任意で入力する
   - 1週間後アンケートを送る場合の連絡用
5. 事前アンケートに回答する
6. シミュレーションをプレイする
7. 診断結果を確認する
8. 事後アンケートに回答する
9. 最後に送信する
10. Google Sheets連携が未設定または失敗した場合はCSVログをダウンロードする

## ログについて
`config.js` の `GOOGLE_SCRIPT_URL` にGoogle Apps ScriptのWebアプリURLを入れると，最後の送信時に回答データがGoogle Sheetsへ送られます。
未設定の場合でも，結果画面・終了画面からCSVをダウンロードできます。
CSVには以下が含まれます。

- session_id
- participant_id
- email（任意入力時のみ）
- language
- 事前アンケート回答
- 各問題の回答，正誤，回答時間
- 診断結果の正答数
- カテゴリ別結果
- 事後アンケート回答

## Google Sheets連携
1. Google Sheetsを作成する
2. 拡張機能からApps Scriptを開く
3. `google-apps-script/Code.gs` の内容を貼り付ける
4. Webアプリとしてデプロイする
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
5. 発行されたWebアプリURLを `config.js` の `GOOGLE_SCRIPT_URL` に貼る
6. Apps Script上で `createFollowUpGoogleForm()` を一度実行する
   - 1週間後アンケート用のGoogle Formが作成され，同じSpreadsheetに回答が保存されます
   - 実行ログまたは `setup_log` シートに編集URL・公開URLが出ます
7. Apps Script上で `installDailyTrigger()` を一度実行すると，1週間後メール送信の確認用トリガーが作成されます
8. 必要なら `config.js` の `FOLLOW_UP_URL` にGoogle Formの事前入力URLを貼る
   - `{participantId}` と `{sessionId}` を入れたURLテンプレートにすると，終了画面にも個別リンクを表示できます
   - 未設定でも，Apps Script側で作成したGoogle Formの事前入力URLをメール送信時に生成できます

## 全体比較表示
結果画面には，自分のカテゴリ別結果と全体比較枠があります。
集計データが溜まったら，Google Sheets側で平均を出し，`config.js` の `GROUP_STATS` に入れると比較表示が有効になります。
