import type { Messages } from './en';

export const ja: Messages = {
  'common.level': 'レベル',
  'common.undo': '元に戻す',
  'common.restart': 'やり直す',
  'common.cancel': 'キャンセル',
  'common.loading': '読み込み中…',

  'levels.completed': 'クリア済み',
  'levels.inProgress': 'プレイ中',

  'game.controls': 'ゲーム操作',
  'game.selectTile': 'タイルを選ぶと結果を確認できます。',
  'game.enemy': '敵{{value}}',
  'game.boss': 'ボス{{value}}',
  'game.addLabel': '+{{value}}を足す',
  'game.multiplyLabel': '{{value}}をかける',
  'game.subtractLabel': '{{value}}を引く',
  'game.divideLabel': '{{value}}で割る',
  'game.subtractPreview': '引き算：{{before}} → {{after}}',
  'game.dividePreview': '割り算：{{before}} → {{after}}',
  'game.takeSubtract': '{{value}}を引く',
  'game.takeDivide': '{{value}}で割る',
  'game.nonPositiveResult': '結果は1以上でなければなりません。',
  'game.nonIntegerResult': '割り算の結果は整数でなければなりません。',
  'hintAction.subtract': '開始地点から、−{{value}}のタイルを取りましょう。',
  'hintAction.divide': '開始地点から、÷{{value}}のタイルを取りましょう。',
  'announce.subtract': '引き算をしました。値は{{value}}です。',
  'announce.divide': '割り算をしました。値は{{value}}です。',
  'rule.subtract':
    '表示された数を一度だけ引きます。結果が1未満になる場合は何も変わりません。',
  'rule.divide':
    '表示された2以上の整数で一度だけ割ります。割り切れない場合は何も変わりません。',
  'game.rowColumn': '{{row}}行{{column}}列',
  'game.reachable': '到達可能',
  'game.blockedTile': '現在ふさがり中',
  'game.playerValue': 'プレイヤーの値{{value}}',
  'game.boardAria': '{{title}}のパズル盤',
  'game.you': 'あなた',
  'game.lives': '残機',
  'game.bossLabel': 'ボス',
  'game.spareLivesAria': '残機：{{total}}のうち残り{{left}}',
  'game.levelMissing': 'このレベルは見つかりませんでした。',
  'game.rulesForSelection': 'この選択のルール',
  'game.rulesWindow': '範囲の敵の仕組み',
  'game.rulesSet': '設定タイルの仕組み',

  'game.absorb': '吸収：{{before}} → {{after}}',
  'game.defeatPreview': '撃破：{{before}} → {{after}}',
  'game.winLine': 'ボスが倒れた。勝利！',
  'game.addPreview': '足し算：{{before}} → {{after}}',
  'game.multiplyPreview': '掛け算：{{before}} → {{after}}',
  'game.setPreview': '設定：{{before}} → {{after}}',
  'game.bankPreview': '{{value}}を預ける：敵は{{enemy}}に',
  'game.respawnPreview': '{{value}}で復活 • 残機を1つ消費',
  'game.lossPreview': 'これには勝てません。',
  'game.lossFinal': '残機がないため、ここで挑戦は終わりです。',
  'game.tieLoses': '同じ数値でも負けになります。',

  'tile.window': '{{min}}–{{max}}のとき吸収できる',
  'tile.exactWindow': 'ちょうど{{value}}のとき吸収できる',
  'rule.window':
    '表示範囲内の値で攻撃すると敵を吸収できます。範囲外なら自分の値が敵に加わります。残機があれば開始地点に戻り、なければ挑戦が終わります。',

  'combat.tooHigh': '値が大きすぎて吸収できません',
  'combat.tooLow': '値が小さすぎて吸収できません',
  'combat.nextWindow': '次の吸収範囲：{{min}}–{{max}}',

  'game.takeAdd': '+{{value}}を取る',
  'game.takeMultiply': '{{value}}をかける',
  'game.takeSet': '{{value}}に設定',
  'game.setLabel': '設定タイル：{{value}}',
  'game.absorbEnemy': '敵を吸収',
  'game.defeatBoss': 'ボスを倒す',
  'game.bankButton': '{{value}}を預ける',
  'game.attackAnyway': 'それでも攻める',
  'game.blocked': 'ふさがれています。別のタイルが道をふさいでいます。',
  'game.cannotInteract': '今はこれを操作できません。',
  'game.stepsPreview': '+{{count}} 歩',

  'result.winTitle': 'レベルクリア！',
  'result.results': '結果',
  'result.lostTitle': '敗北',
  'result.lostBody':
    '残機がありません。直前の一手を戻すか、やり直してください。',

  'hint.none': 'ヒントはありません。',
  'hint.arithmeticOrder':
    '演算タイルは1回だけ使えます。足してから掛けるといくつになりますか？ 順番を逆にするとどうなりますか？',
  'hint.bankPlanning':
    '攻撃に負けると、自分の値が敵に加わります。残機があれば開始時の値に戻れます。次に訪れたとき、その敵を吸収できるでしょうか？',
  'hint.bossPlanning':
    'ボスから逆算しましょう。どのタイルを使えば、ボスより大きい値になれますか？',
  'hint.reachableTarget':
    '到達できる敵の中から、自分より値の小さい敵を探しましょう。',

  'hintAction.absorb': '開始地点から、値が{{value}}の敵を吸収しましょう。',
  'hintAction.win': '{{value}}のボスを倒しましょう。',
  'hintAction.bank':
    '開始地点から、値が{{value}}の敵を攻撃して{{player}}を預けましょう。',
  'hintAction.add': '開始地点から、+{{value}}のタイルを取りましょう。',
  'hintAction.multiply': '開始地点から、×{{value}}のタイルを取りましょう。',
  'hintAction.set': '開始地点から、値を{{value}}にするタイルを使いましょう。',

  'announce.absorb': '敵を吸収しました。値は{{value}}です。',
  'announce.win': '最終値{{value}}でボスを撃破しました。勝利です！',
  'announce.add': '足し算をしました。値は{{value}}です。',
  'announce.multiply': '掛け算をしました。値は{{value}}です。',
  'announce.set': '値を{{value}}に設定しました。',
  'announce.respawn':
    '預けました。敵は{{enemy}}に育ち、値{{value}}で復活します。',
  'announce.loss': '敗北しました。挑戦は終了です。',
  'announce.undo': '直前の一手を戻しました。',
  'announce.restart': 'レベルをやり直しました。',

  'settings.title': '設定',
  'settings.appearance': '外観',
  'settings.lightPalette': 'ライトテーマ',
  'settings.darkPalette': 'ダークテーマ',
  'settings.system': 'システム',
  'settings.theme.light': 'ライト',
  'settings.theme.dark': 'ダーク',
  'settings.motion.reduce': '動きを減らす',
  'settings.motion': 'モーション',
  'settings.theme': 'テーマ',
  'settings.language': '言語',

  'game.practiceCounter':
    '行動回数：{{actions}} · 証明済み最少手数：{{minimum}}',

  'daily.loading': '読み込み中…',
  'daily.error': 'パズルを読み込めませんでした。投稿を開き直してください。',
  'daily.play': '今日のパズルをプレイ',
  'daily.best': '自己ベスト：{{steps}} 歩',
  'daily.streak': '{{count}} 日連続',
  'daily.playAgain': 'もう一度プレイ',
  'daily.restartConfirm':
    'このパズルを最初からやり直しますか？\n現在の挑戦はクリアされます。',
  'leaderboard.title': '本日のリーダーボード',
  'leaderboard.empty': 'まだクリア者がいません。最初の一人になりましょう！',
  'leaderboard.steps': '{{steps}} ステップ',
};
