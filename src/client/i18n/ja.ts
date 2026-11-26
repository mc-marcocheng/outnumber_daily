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
  'game.selectTile': 'タイルを選ぶと、そこへ移動できます。',
  'game.enemy': '敵{{value}}',
  'game.boss': 'ボス{{value}}',
  'game.addLabel': '{{value}}を足す',
  'game.multiplyLabel': '{{value}}をかける',
  'game.subtractLabel': '{{value}}を引く',
  'game.divideLabel': '{{value}}で割る',
  'game.subtractPreview': '引き算：{{before}} → {{after}}',
  'game.dividePreview': '割り算：{{before}} → {{after}}',
  'game.takeSubtract': '{{value}}を引く',
  'game.takeDivide': '{{value}}で割る',
  'game.nonPositiveResult': '結果は1以上でなければなりません。',
  'game.nonIntegerResult': '割り算の結果は整数でなければなりません。',
  'hintAction.subtract': 'スタートから、−{{value}}のタイルを取りましょう。',
  'hintAction.divide': 'スタートから、÷{{value}}のタイルを取りましょう。',
  'announce.subtract': '引いて{{value}}になりました。',
  'announce.divide': '割って{{value}}になりました。',
  'rule.subtract':
    '表示された数を一度だけ引きます。結果が1未満になる場合は何も変わりません。',
  'rule.divide':
    '表示された2以上の整数で一度だけ割ります。割り切れない場合は何も変わりません。',
  'game.rowColumn': '{{row}}行{{column}}列',
  'game.reachable': '行ける',
  'game.blockedTile': '今は行けない',
  'game.playerValue': 'あなたの数 {{value}}',
  'game.boardAria': '{{title}}のパズル盤',
  'game.you': 'あなた',
  'game.lives': '残機',
  'game.bossLabel': 'ボス',
  'game.spareLivesAria': '残機 {{left}}/{{total}}',
  'game.levelMissing': 'このレベルは見つかりませんでした。',
  'game.rulesForSelection': 'この選択のルール',
  'game.rulesWindow': '範囲つきの敵のルール',
  'game.rulesSet': '=タイルのルール',

  'game.absorb': '吸収：{{before}} → {{after}}',
  'game.defeatPreview': '撃破：{{before}} → {{after}}',
  'game.winLine': 'ボスが倒れた。勝利！',
  'game.addPreview': '足し算：{{before}} → {{after}}',
  'game.multiplyPreview': '掛け算：{{before}} → {{after}}',
  'game.setPreview': '設定：{{before}} → {{after}}',
  'game.bankPreview': '{{value}}を預ける：敵は{{enemy}}に',
  'game.respawnPreview': '{{value}}でスタートに戻る • 残機を1つ使う',
  'game.lossPreview': 'これには勝てません。',
  'game.lossFinal': '残機がないため、ここで挑戦は終わりです。',
  'game.tieLoses': '同じ数だと負けです。',

  'tile.window': '{{min}}–{{max}}のとき吸収できる',
  'tile.exactWindow': 'ちょうど{{value}}のとき吸収できる',
  'rule.window':
    '自分の数が表示された範囲内なら、敵を吸収できます。範囲外だと、自分の数が敵に加わります。残機があればスタートに戻り、なければ挑戦は終わりです。',

  'combat.tooHigh': '数が大きすぎて吸収できません',
  'combat.tooLow': '数が小さすぎて吸収できません',
  'combat.nextWindow': '次の吸収範囲：{{min}}–{{max}}',

  'game.takeAdd': '+{{value}}を取る',
  'game.takeMultiply': '{{value}}をかける',
  'game.takeSet': '{{value}}に設定',
  'game.setLabel': '{{value}}に置き換える',
  'game.absorbEnemy': '敵を吸収',
  'game.defeatBoss': 'ボスを倒す',
  'game.bankButton': '{{value}}を預ける',
  'game.attackAnyway': 'それでも攻める',
  'game.blocked': 'ほかのタイルが道をふさいでいます。',
  'game.cannotInteract': '今は使えません。',
  'game.stepsPreview': '+{{count}} 歩',

  'result.winTitle': 'クリア！',
  'result.results': '結果',
  'result.lostTitle': '敗北',
  'result.lostBody':
    '残機がありません。1手戻すか、最初からやり直してください。',

  'hint.none': 'ヒントはありません。',
  'hint.arithmeticOrder':
    '演算タイルは1回だけ使えます。足してから掛けるといくつになりますか？ 順番を逆にするとどうなりますか？',
  'hint.bankPlanning':
    '攻撃に失敗すると、自分の数が敵に加わります。残機があれば、最初の数に戻って続けられます。次に来たとき、大きくなった敵を吸収できるでしょうか？',
  'hint.bossPlanning':
    'ボスから逆算しましょう。どのタイルを使えば、ボスより大きい数になれますか？',
  'hint.reachableTarget':
    '行ける敵の中から、自分より数の小さい敵を探しましょう。',

  'hintAction.absorb': 'スタートから、{{value}}の敵を吸収しましょう。',
  'hintAction.win': '{{value}}のボスを倒しましょう。',
  'hintAction.bank':
    'スタートから、{{value}}の敵を攻撃して{{player}}を預けましょう。',
  'hintAction.add': 'スタートから、+{{value}}のタイルを取りましょう。',
  'hintAction.multiply': 'スタートから、×{{value}}のタイルを取りましょう。',
  'hintAction.set': 'スタートから、数を{{value}}にするタイルを使いましょう。',

  'announce.absorb': '敵を吸収して{{value}}になりました。',
  'announce.win': '{{value}}でボスを倒しました。勝ちです！',
  'announce.add': '足して{{value}}になりました。',
  'announce.multiply': '掛けて{{value}}になりました。',
  'announce.set': '数が{{value}}に置き換わりました。',
  'announce.respawn':
    '攻撃に失敗しました。敵は{{enemy}}になり、{{value}}でスタートに戻ります。',
  'announce.loss': '負けました。この挑戦は終わりです。',
  'announce.undo': '1手戻しました。',
  'announce.restart': '最初からやり直しました。',

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
    'このパズルを最初からやり直しますか？\n今の手順は消えます。',
  'leaderboard.title': '本日のリーダーボード',
  'leaderboard.empty': 'まだクリア者がいません。最初の一人になりましょう！',
  'leaderboard.steps': '{{steps}} 歩',
};
