import type { AppLocale } from './locales';

export const tutorialCopy: Record<AppLocale, Record<string, string>> = {
  en: {
    'tutorial.lesson.subtract.title': 'Subtract to fit',
    'tutorial.lesson.subtract.description':
      'A − tile subtracts once. The result must be at least 1. Try −4 first: it stays on the board and costs no steps. Take +8, then −4 to reach 7 and absorb the window enemy.',
    'tutorial.lesson.divide.title': 'Divide exactly',
    'tutorial.lesson.divide.description':
      'A ÷ tile divides once by an integer of at least 2. The result must be a whole number. Try ÷2 first: 5 cannot divide exactly, so nothing changes. Take +9, then ÷2 to reach 7 and absorb the window enemy.',
    'tutorial.brand': 'OUTNUMBER',
    'tutorial.breadcrumb': 'OUTNUMBER / TUTORIALS',
    'tutorial.title': 'Tutorials',
    'tutorial.back': 'Back to daily puzzle',
    'tutorial.menu': 'Tutorial menu',
    'tutorial.close': 'Close tutorials',
    'tutorial.guided.title': 'The first run',
    'tutorial.guided.description': 'Guided walkthrough',
    'tutorial.practice': 'Practice',
    'tutorial.practiceLabel': 'PRACTICE',
    'tutorial.progress': '{{current}} / {{total}}',
    'tutorial.blocked': 'Blocked: another object is in the way.',
    'tutorial.lost': 'No hearts left. Undo to try a different route.',
    'tutorial.complete': 'Complete!',
    'tutorial.route': 'Route',
    'tutorial.expectedRoute': 'Expected route',
    'tutorial.previous': 'Previous',
    'tutorial.next': 'Next',
    'tutorial.undo': 'Undo',
    'tutorial.restart': 'Restart',
    'tutorial.play': 'Play',
    'tutorial.pause': 'Pause',
    'tutorial.replay': 'Replay',
    'tutorial.lesson.walking.title': 'Find a path',
    'tutorial.lesson.walking.description':
      'Tap an empty cell to walk. Objects block paths until used. Every square travelled costs one step; Undo refunds it.',
    'tutorial.lesson.addition.title': 'A little stronger',
    'tutorial.lesson.addition.description':
      'Green + tiles add to your number, once. Become strictly larger than the boss to win.',
    'tutorial.lesson.multiply.title': 'Order matters',
    'tutorial.lesson.multiply.description':
      "Blue tiles multiply your number. Add first, then multiply to reach the boss's number plus one.",
    'tutorial.lesson.set.title': 'A fresh number',
    'tutorial.lesson.set.description':
      "An = tile replaces your number with the value shown. Use =6 to enter the window enemy's range.",
    'tutorial.lesson.combat.title': 'Absorb and grow',
    'tutorial.lesson.combat.description':
      'You must be strictly larger to absorb an enemy. Its number is then added to yours. A tie is a defeat.',
    'tutorial.lesson.window.title': 'Within the window',
    'tutorial.lesson.window.description':
      'The badge shows the values that can absorb this enemy. Values below or above that range lose. Aim for 7 here.',
    'tutorial.lesson.bank.title': 'Bank a life',
    'tutorial.lesson.bank.description':
      'The window accepts only 6 or 7, but +6 makes you 9. Bank your starting 3 into the window enemy first: it grows to 8 and now accepts 9 or 10. Return home, take +6, and absorb it.',
    'tutorial.lesson.undo.title': 'Save the multiplier',
    'tutorial.lesson.undo.description':
      'The multiplier works once. Grow by absorbing the small enemy before using it. If you multiply too early, Undo restores the tile and refunds your steps.',
    'tutorial.lesson.blocked.title': 'Clear the corridor',
    'tutorial.lesson.blocked.description':
      'Try the boss or empty far-right cell first: the + tile blocks the only route. Use it to open the corridor. A blocked click costs nothing.',
    'tutorial.guided.page.0.title': 'You',
    'tutorial.guided.page.0.text':
      'The portrait is you. Tap empty floor to walk; tap an object to walk to it and interact. Only travelled squares count as steps.',
    'tutorial.guided.page.1.title': 'Walk around objects',
    'tutorial.guided.page.1.text':
      'One square walked, one step. The + tile blocks the corridor to the right; objects cannot be crossed until consumed.',
    'tutorial.guided.page.2.title': 'Add',
    'tutorial.guided.page.2.text':
      '+2 turns 3 into 5. Arithmetic tiles disappear after one use, leaving open floor.',
    'tutorial.guided.page.3.title': 'Multiply',
    'tutorial.guided.page.3.text':
      'Multiply by 2: 5 becomes 10. Changing the order of arithmetic changes the result.',
    'tutorial.guided.page.4.title': 'Set',
    'tutorial.guided.page.4.text':
      '=4 replaces 10 with 4. A smaller number can help with narrow absorption windows.',
    'tutorial.guided.page.5.title': 'Absorb',
    'tutorial.guided.page.5.text':
      '4 is strictly larger than 3, so you absorb the enemy and become 7. A tie would lose.',
    'tutorial.guided.page.6.title': 'Hit the window',
    'tutorial.guided.page.6.text':
      'This enemy accepts player values 6 to 8. Your 7 is in range: absorb 5 and become 12. Too large also loses.',
    'tutorial.guided.page.7.title': 'Bank and respawn',
    'tutorial.guided.page.7.text':
      '12 cannot beat 20. The boss grows to 32, a heart is spent, and you return home as 3. Other changes remain. With no hearts, a defeat ends the run.',
    'tutorial.guided.page.8.title': 'Build again',
    'tutorial.guided.page.8.text':
      'The reserve +40 makes you 43. The corridor remains clear and the boss still holds your deposited 12.',
    'tutorial.guided.page.9.title': 'Outnumber the boss',
    'tutorial.guided.page.9.text':
      '43 beats 32: you win. Undo restores a turn and refunds its steps. Restart resets the puzzle. Daily hints give clues from the starting position. Try the practice puzzles next.',
  },
  ja: {
    'tutorial.lesson.subtract.title': '引いて範囲に収める',
    'tutorial.lesson.subtract.description':
      '−タイルは1回だけ引き算をします。結果は1以上でなければなりません。まず−4を試してみましょう。使えないときはタイルが残り、歩数も増えません。+8、−4の順に進んで7にし、範囲つきの敵を吸収しましょう。',
    'tutorial.lesson.divide.title': '割り切れる数にする',
    'tutorial.lesson.divide.description':
      '÷タイルは2以上の数で1回だけ割ります。結果は整数でなければなりません。まず÷2を試してみましょう。5は割り切れないので何も変わりません。+9、÷2の順に進んで7にし、範囲つきの敵を吸収しましょう。',
    'tutorial.brand': 'OUTNUMBER',
    'tutorial.breadcrumb': 'OUTNUMBER / チュートリアル',
    'tutorial.title': 'チュートリアル',
    'tutorial.back': '今日のパズルに戻る',
    'tutorial.menu': 'チュートリアルメニュー',
    'tutorial.close': 'チュートリアルを閉じる',
    'tutorial.guided.title': 'はじめてのプレイ',
    'tutorial.guided.description': 'ガイド付きの練習',
    'tutorial.practice': '練習',
    'tutorial.practiceLabel': '練習',
    'tutorial.progress': '{{current}} / {{total}}',
    'tutorial.blocked': 'ほかのタイルが道をふさいでいます。',
    'tutorial.lost':
      'ハートがなくなりました。「元に戻す」で別のルートを試せます。',
    'tutorial.complete': 'クリア！',
    'tutorial.route': 'ルート',
    'tutorial.expectedRoute': '正解のルート',
    'tutorial.previous': '前へ',
    'tutorial.next': '次へ',
    'tutorial.undo': '元に戻す',
    'tutorial.restart': 'やり直す',
    'tutorial.play': '再生',
    'tutorial.pause': '一時停止',
    'tutorial.replay': 'もう一度再生',
    'tutorial.lesson.walking.title': '道を見つける',
    'tutorial.lesson.walking.description':
      '空いているマスをタップすると移動します。タイルや敵は、使うまで道をふさぎます。1マス進むごとに1歩と数えます。「元に戻す」を使うと歩数も戻ります。',
    'tutorial.lesson.addition.title': '少し強くなる',
    'tutorial.lesson.addition.description':
      '緑の+タイルに進むと、自分の数に足されます。使えるのは1回だけです。ボスより大きい数になれば勝ちです。',
    'tutorial.lesson.multiply.title': '順番が大事',
    'tutorial.lesson.multiply.description':
      '青いタイルは自分の数に掛け算をします。先に足してから掛けると、ボスより1大きい数になります。',
    'tutorial.lesson.set.title': '数を置き換える',
    'tutorial.lesson.set.description':
      '=タイルは自分の数を表示された数に置き換えます。=6を使って、範囲つきの敵を吸収できる数にしましょう。',
    'tutorial.lesson.combat.title': '吸収して強くなる',
    'tutorial.lesson.combat.description':
      '敵を吸収するには、敵より大きい数が必要です。吸収すると敵の数が自分の数に加わります。同じ数では負けます。',
    'tutorial.lesson.window.title': '範囲に収める',
    'tutorial.lesson.window.description':
      'バッジは、この敵を吸収できる数の範囲を示します。範囲より小さくても大きくても負けます。ここでは7を目指しましょう。',
    'tutorial.lesson.bank.title': 'ハートを使って数を預ける',
    'tutorial.lesson.bank.description':
      'この敵を吸収できるのは6か7ですが、+6 を使うと9になります。まず初期値の3で敵に挑み、数を預けましょう。敵は8になり、9か10で吸収できるようになります。スタート地点に戻ったら +6 を取り、敵を吸収しましょう。',
    'tutorial.lesson.undo.title': '掛け算は後に',
    'tutorial.lesson.undo.description':
      '掛け算タイルは一度しか使えません。先に小さな敵を吸収して数を増やしましょう。早く掛けすぎたら、「元に戻す」でタイルも歩数も元に戻せます。',
    'tutorial.lesson.blocked.title': '通路を開く',
    'tutorial.lesson.blocked.description':
      'まずボスか右端の空きマスをタップしてみましょう。+ タイルが唯一の道をふさいでいます。使うと通路が開きます。道がふさがれているときのタップでは歩数は増えません。',
    'tutorial.guided.page.0.title': 'あなた',
    'tutorial.guided.page.0.text':
      'この顔があなたです。空いているマスをタップすると移動します。タイルや敵をタップすると、そこまで進んで使うか戦います。歩数に数えるのは、実際に進んだマスだけです。',
    'tutorial.guided.page.1.title': 'タイルをよけて進む',
    'tutorial.guided.page.1.text':
      '1マス進むと1歩です。+タイルが右の通路をふさいでいます。タイルは使って消すまで通り抜けられません。',
    'tutorial.guided.page.2.title': '足す',
    'tutorial.guided.page.2.text':
      '+2で3が5になります。計算のタイルは1回使うと消え、通れるようになります。',
    'tutorial.guided.page.3.title': '掛ける',
    'tutorial.guided.page.3.text':
      '2を掛けると5が10になります。計算の順番を変えると結果も変わります。',
    'tutorial.guided.page.4.title': '置き換える',
    'tutorial.guided.page.4.text':
      '=4 で10を4に置き換えます。吸収できる範囲が狭い敵には、小さい数が役立つこともあります。',
    'tutorial.guided.page.5.title': '吸収する',
    'tutorial.guided.page.5.text':
      '4は3より大きいので、敵を吸収して7になります。同じ数なら負けます。',
    'tutorial.guided.page.6.title': '範囲を狙う',
    'tutorial.guided.page.6.text':
      'この敵は6から8で吸収できます。あなたの7は範囲内です。5を吸収して12になります。大きすぎても負けます。',
    'tutorial.guided.page.7.title': '数を預けて再出発',
    'tutorial.guided.page.7.text':
      '12では20に勝てません。ボスは32になり、ハートを1つ使って、あなたは3でスタート地点に戻ります。ほかの変化はそのまま残ります。ハートがなければ、負けた時点でプレイ終了です。',
    'tutorial.guided.page.8.title': 'もう一度強くなる',
    'tutorial.guided.page.8.text':
      '残しておいた +40 で43になります。通路は開いたままで、ボスには預けた12が残っています。',
    'tutorial.guided.page.9.title': 'ボスを上回る',
    'tutorial.guided.page.9.text':
      '43は32より大きいので勝利です。「元に戻す」は1手とその歩数を戻します。「やり直す」はパズルを最初に戻します。今日のパズルのヒントは初期状態をもとにしています。次は練習問題に挑みましょう。',
  },
  'zh-Hans': {
    'tutorial.lesson.subtract.title': '减到范围内',
    'tutorial.lesson.subtract.description':
      '− 方块只能减一次，结果必须至少为1。先试试 −4：方块会保留，也不消耗步数。先拿 +8，再用 −4 得到7，吸收范围有限的敌人。',
    'tutorial.lesson.divide.title': '整除后再前进',
    'tutorial.lesson.divide.description':
      '÷ 方块只能除一次，除数是至少为2的整数，结果必须是整数。先试试 ÷2：5不能整除，所以什么都不会改变。先拿 +9，再用 ÷2 得到7，吸收范围有限的敌人。',
    'tutorial.brand': 'OUTNUMBER',
    'tutorial.breadcrumb': 'OUTNUMBER / 教程',
    'tutorial.title': '教程',
    'tutorial.back': '返回每日谜题',
    'tutorial.menu': '教程菜单',
    'tutorial.close': '关闭教程',
    'tutorial.guided.title': '初次挑战',
    'tutorial.guided.description': '引导练习',
    'tutorial.practice': '练习',
    'tutorial.practiceLabel': '练习',
    'tutorial.progress': '{{current}} / {{total}}',
    'tutorial.blocked': '有其他东西挡住了路。',
    'tutorial.lost': '爱心已用完。撤销后可以尝试其他路线。',
    'tutorial.complete': '完成！',
    'tutorial.route': '路线',
    'tutorial.expectedRoute': '解题路线',
    'tutorial.previous': '上一步',
    'tutorial.next': '下一步',
    'tutorial.undo': '撤销',
    'tutorial.restart': '重新开始',
    'tutorial.play': '播放',
    'tutorial.pause': '暂停',
    'tutorial.replay': '重新播放',
    'tutorial.lesson.walking.title': '寻找路径',
    'tutorial.lesson.walking.description':
      '点击空格即可移动。物体在使用前会挡路。每走一格计为一步；撤销会退还步数。',
    'tutorial.lesson.addition.title': '再强一点',
    'tutorial.lesson.addition.description':
      '绿色 + 方块会增加你的数值，只能用一次。你的数值必须大于首领才能获胜。',
    'tutorial.lesson.multiply.title': '顺序很重要',
    'tutorial.lesson.multiply.description':
      '蓝色方块会让你的数值乘以标示的数。先加后乘，让数值比首领大1。',
    'tutorial.lesson.set.title': '替换数值',
    'tutorial.lesson.set.description':
      '= 方块会把你的数值替换为显示的数。使用 =6，进入这个敌人的可吸收范围。',
    'tutorial.lesson.combat.title': '吸收并成长',
    'tutorial.lesson.combat.description':
      '你的数值必须大于敌人才能吸收它。吸收后，敌人的数值会加到你的数值上。相等也算失败。',
    'tutorial.lesson.window.title': '保持在范围内',
    'tutorial.lesson.window.description':
      '标记显示了能吸收这个敌人的数值范围。低于或高于范围都会失败。这里要达到7。',
    'tutorial.lesson.bank.title': '用一颗心存入数值',
    'tutorial.lesson.bank.description':
      '这个敌人只能被6或7吸收，但 +6 会让你变成9。先用初始数值3挑战它，把3存进去：它会变成8，此时9或10就能吸收它。回到起点，拿取 +6，再吸收它。',
    'tutorial.lesson.undo.title': '留着乘法方块',
    'tutorial.lesson.undo.description':
      '乘法方块只能用一次。先吸收小敌人，增加数值后再用。如果乘得太早，撤销可以恢复方块并退还步数。',
    'tutorial.lesson.blocked.title': '打通走廊',
    'tutorial.lesson.blocked.description':
      '先试着点击首领或最右侧的空格：+ 方块挡住了唯一的路。使用它就能打通走廊。点击被挡住的目标不会消耗步数。',
    'tutorial.guided.page.0.title': '你',
    'tutorial.guided.page.0.text':
      '头像代表你。点击空地可以移动；点击方块或敌人，会走过去使用它或和它战斗。只有实际走过的格子才计入步数。',
    'tutorial.guided.page.1.title': '绕过物体',
    'tutorial.guided.page.1.text':
      '每走一格算一步。+ 方块挡住了右侧走廊；物体用掉之前不能穿过。',
    'tutorial.guided.page.2.title': '加法',
    'tutorial.guided.page.2.text':
      '+2 让3变成5。运算方块用过一次就会消失，留下可通行的空地。',
    'tutorial.guided.page.3.title': '乘法',
    'tutorial.guided.page.3.text': '乘以2：5变成10。改变运算顺序会改变结果。',
    'tutorial.guided.page.4.title': '赋值',
    'tutorial.guided.page.4.text':
      '=4 把10替换为4。较小的数值有时能帮助你进入狭窄的吸收范围。',
    'tutorial.guided.page.5.title': '吸收',
    'tutorial.guided.page.5.text':
      '4大于3，所以你吸收敌人，变成7。如果数值相等就会失败。',
    'tutorial.guided.page.6.title': '进入范围',
    'tutorial.guided.page.6.text':
      '这个敌人能被6到8吸收。你的7在范围内：吸收5后变成12。数值太大也会失败。',
    'tutorial.guided.page.7.title': '存入数值并重生',
    'tutorial.guided.page.7.text':
      '12打不过20。首领变成32，你消耗一颗心，以数值3回到起点。其他变化保留。没有爱心时，失败会结束本次挑战。',
    'tutorial.guided.page.8.title': '重新积累',
    'tutorial.guided.page.8.text':
      '预留的 +40 让你变成43。走廊仍然畅通，首领也仍保留着你存入的12。',
    'tutorial.guided.page.9.title': '超过首领',
    'tutorial.guided.page.9.text':
      '43大于32，你赢了。撤销会恢复上一步并退还步数。重新开始会重置谜题。每日提示以初始状态为依据。接下来试试练习谜题。',
  },
  'zh-Hant': {
    'tutorial.lesson.subtract.title': '減到範圍內',
    'tutorial.lesson.subtract.description':
      '− 方塊只能減一次，結果必須至少為1。先試試 −4：方塊會保留，也不消耗步數。先拿 +8，再用 −4 得到7，吸收範圍有限的敵人。',
    'tutorial.lesson.divide.title': '整除後再前進',
    'tutorial.lesson.divide.description':
      '÷ 方塊只能除一次，除數是至少為2的整數，結果必須是整數。先試試 ÷2：5不能整除，所以什麼都不會改變。先拿 +9，再用 ÷2 得到7，吸收範圍有限的敵人。',
    'tutorial.brand': 'OUTNUMBER',
    'tutorial.breadcrumb': 'OUTNUMBER / 教學',
    'tutorial.title': '教學',
    'tutorial.back': '返回每日謎題',
    'tutorial.menu': '教學選單',
    'tutorial.close': '關閉教學',
    'tutorial.guided.title': '初次挑戰',
    'tutorial.guided.description': '引導練習',
    'tutorial.practice': '練習',
    'tutorial.practiceLabel': '練習',
    'tutorial.progress': '{{current}} / {{total}}',
    'tutorial.blocked': '有其他東西擋住了路。',
    'tutorial.lost': '愛心已用完。復原後可以嘗試其他路線。',
    'tutorial.complete': '完成！',
    'tutorial.route': '路線',
    'tutorial.expectedRoute': '解題路線',
    'tutorial.previous': '上一步',
    'tutorial.next': '下一步',
    'tutorial.undo': '復原',
    'tutorial.restart': '重新開始',
    'tutorial.play': '播放',
    'tutorial.pause': '暫停',
    'tutorial.replay': '重新播放',
    'tutorial.lesson.walking.title': '尋找路徑',
    'tutorial.lesson.walking.description':
      '點選空格即可移動。物體在使用前會擋路。每走一格計為一步；復原會退還步數。',
    'tutorial.lesson.addition.title': '再強一點',
    'tutorial.lesson.addition.description':
      '綠色 + 方塊會增加你的數值，只能用一次。你的數值必須大於首領才能獲勝。',
    'tutorial.lesson.multiply.title': '順序很重要',
    'tutorial.lesson.multiply.description':
      '藍色方塊會讓你的數值乘以標示的數。先加後乘，讓數值比首領大1。',
    'tutorial.lesson.set.title': '替換數值',
    'tutorial.lesson.set.description':
      '= 方塊會把你的數值替換為顯示的數。使用 =6，進入這個敵人的可吸收範圍。',
    'tutorial.lesson.combat.title': '吸收並成長',
    'tutorial.lesson.combat.description':
      '你的數值必須大於敵人才能吸收它。吸收後，敵人的數值會加到你的數值上。相等也算失敗。',
    'tutorial.lesson.window.title': '保持在範圍內',
    'tutorial.lesson.window.description':
      '標記顯示了能吸收這個敵人的數值範圍。低於或高於範圍都會失敗。這裡要達到7。',
    'tutorial.lesson.bank.title': '用一顆心存入數值',
    'tutorial.lesson.bank.description':
      '這個敵人只能被6或7吸收，但 +6 會讓你變成9。先用初始數值3挑戰它，把3存進去：它會變成8，此時9或10就能吸收它。回到起點，取得 +6，再吸收它。',
    'tutorial.lesson.undo.title': '留著乘法方塊',
    'tutorial.lesson.undo.description':
      '乘法方塊只能用一次。先吸收小敵人，增加數值後再用。如果乘得太早，復原可以恢復方塊並退還步數。',
    'tutorial.lesson.blocked.title': '打通走廊',
    'tutorial.lesson.blocked.description':
      '先試著點選首領或最右側的空格：+ 方塊擋住了唯一的路。使用它就能打通走廊。點選被擋住的目標不會消耗步數。',
    'tutorial.guided.page.0.title': '你',
    'tutorial.guided.page.0.text':
      '頭像代表你。點選空地可以移動；點選方塊或敵人，會走過去使用它或和它戰鬥。只有實際走過的格子才計入步數。',
    'tutorial.guided.page.1.title': '繞過物體',
    'tutorial.guided.page.1.text':
      '每走一格算一步。+ 方塊擋住了右側走廊；物體用掉之前不能穿過。',
    'tutorial.guided.page.2.title': '加法',
    'tutorial.guided.page.2.text':
      '+2 讓3變成5。運算方塊用過一次就會消失，留下可通行的空地。',
    'tutorial.guided.page.3.title': '乘法',
    'tutorial.guided.page.3.text': '乘以2：5變成10。改變運算順序會改變結果。',
    'tutorial.guided.page.4.title': '設值',
    'tutorial.guided.page.4.text':
      '=4 把10替換為4。較小的數值有時能幫助你進入狹窄的吸收範圍。',
    'tutorial.guided.page.5.title': '吸收',
    'tutorial.guided.page.5.text':
      '4大於3，所以你吸收敵人，變成7。如果數值相等就會失敗。',
    'tutorial.guided.page.6.title': '進入範圍',
    'tutorial.guided.page.6.text':
      '這個敵人能被6到8吸收。你的7在範圍內：吸收5後變成12。數值太大也會失敗。',
    'tutorial.guided.page.7.title': '存入數值並重生',
    'tutorial.guided.page.7.text':
      '12打不過20。首領變成32，你消耗一顆心，以數值3回到起點。其他變化保留。沒有愛心時，失敗會結束本次挑戰。',
    'tutorial.guided.page.8.title': '重新累積',
    'tutorial.guided.page.8.text':
      '預留的 +40 讓你變成43。走廊仍然暢通，首領也仍保留著你存入的12。',
    'tutorial.guided.page.9.title': '超過首領',
    'tutorial.guided.page.9.text':
      '43大於32，你贏了。復原會恢復上一步並退還步數。重新開始會重設謎題。每日提示以初始狀態為依據。接下來試試練習謎題。',
  },
};
