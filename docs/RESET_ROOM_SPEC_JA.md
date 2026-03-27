# Reset Room 設計メモ

## 目的

`Reset Room` は、現在のペアリング済みルームを明示的に破棄し、PC 側拡張の接続状態を初期化するための操作です。

## 仕様

- 実行主体は extension popup。
- 実行前に確認ダイアログを表示する。
- `currentRoomId` があり、かつ room join 済みなら、現在ルームへ `remote_command: RESET_ROOM` を best-effort で送る。
- 送信成否に関わらず、拡張側では直ちに認証・ルーム状態を purge する。

## purge 対象

以下を削除する。

- `voicemux_token`
- `voicemux_room_id`
- `voicemux_key`
- `voicemux_paired`
- `voicemux_pairing_code`
- `voicemux_mobile_connected`

あわせて以下を初期化する。

- WebSocket を close
- `currentRoomId = null`
- `isJoined = false`
- `remoteDevices.clear()`

## 非目的

- active page の入力欄だけを消す操作ではない。
- room draft の部分削除や一時停止ではない。
- Hub 側の UI 遷移や再ペアリング開始までは面倒を見ない。

## `CLEAR` との違い

- `CLEAR` は room を維持したまま、現在編集中の draft を消すためのコマンド。
- `Reset Room` は room 自体を破棄し、再ペアリングが必要な状態へ戻す。

## popup 遷移規約

- `Reset Room` 後、popup は未接続状態の表示へ戻る。
- ただし `/pair` への遷移は自動では行わない。
- `/pair` を開くのは、未接続状態でユーザーが primary action を明示的に押したときだけ。
