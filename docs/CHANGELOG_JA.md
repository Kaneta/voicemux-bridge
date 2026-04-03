# 更新履歴 (Changelog)

## [2.2.2] - 2026-04-03
- hidden stability の更新のみで、通常の pairing と text insertion UX は変えていません。
- mobile pairing surface は late peer join 後の presence 再申告と、page hide / visibility / online / offline に対する pause / resume を持つようになりました。
- extension worker は worker load と Chrome startup / install 時に mobile presence を正規化してから relay reconnect を試みます。
- relay の reconnect / purge / join success / wake 判定を小さな helper に分離し、回帰テストで固定しました。

## [2.2.0] - 2026-03-27
- popup 文言を整理し、主機能を「PC 上の Web 入力欄への音声入力」として明確化。
- trusted なファーストパーティ pairing surface から active room snapshot を直接同期できるように調整。
- stale room や reset 後の状態が分かりやすくなるよう、状態処理を見直し。
