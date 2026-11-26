export const en = {
  'common.undo': 'Undo',
  'common.restart': 'Restart',
  'common.level': 'Level',
  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',

  'levels.completed': 'Completed',
  'levels.inProgress': 'In progress',

  'game.controls': 'Game controls',
  'game.selectTile': 'Select a tile to move to it.',
  'game.enemy': 'Enemy {{value}}',
  'game.boss': 'Boss {{value}}',
  'game.addLabel': 'Add {{value}}',
  'game.multiplyLabel': 'Multiply by {{value}}',
  'game.subtractLabel': 'Subtract {{value}}',
  'game.divideLabel': 'Divide by {{value}}',
  'game.subtractPreview': 'Subtract: {{before}} → {{after}}',
  'game.dividePreview': 'Divide: {{before}} → {{after}}',
  'game.takeSubtract': 'Subtract {{value}}',
  'game.takeDivide': 'Divide by {{value}}',
  'game.nonPositiveResult': 'The result must be at least 1.',
  'game.nonIntegerResult': 'Division must give a whole number.',
  'hintAction.subtract': 'From the start, take the −{{value}} tile.',
  'hintAction.divide': 'From the start, take the ÷{{value}} tile.',
  'announce.subtract': 'Subtracted. Value {{value}}.',
  'announce.divide': 'Divided. Value {{value}}.',
  'rule.subtract':
    'Subtract the number shown once. The result must be at least 1; otherwise nothing changes.',
  'rule.divide':
    'Divide once by the integer shown, which is at least 2. The result must be a whole number; otherwise nothing changes.',
  'game.rowColumn': 'row {{row}}, column {{column}}',
  'game.reachable': 'reachable',
  'game.blockedTile': 'currently blocked',
  'game.playerValue': 'Player value {{value}}',
  'game.boardAria': '{{title}} puzzle board',
  'game.you': 'You',
  'game.lives': 'Lives',
  'game.bossLabel': 'Boss',
  'game.spareLivesAria': 'Spare lives: {{left}} of {{total}}',
  'game.levelMissing': 'This level could not be found.',
  'game.rulesForSelection': 'Rules for this selection',
  'game.rulesWindow': 'How window enemies work',
  'game.rulesSet': 'How set tiles work',

  'game.absorb': 'Absorb: {{before}} → {{after}}',
  'game.defeatPreview': 'Defeat: {{before}} → {{after}}',
  'game.winLine': 'The boss falls. You win!',
  'game.addPreview': 'Add: {{before}} → {{after}}',
  'game.multiplyPreview': 'Multiply: {{before}} → {{after}}',
  'game.setPreview': 'Set: {{before}} → {{after}}',
  'game.bankPreview': 'Bank {{value}}: enemy becomes {{enemy}}',
  'game.respawnPreview': 'Respawn at {{value}} • Spend 1 spare life',
  'game.lossPreview': 'You cannot defeat it.',
  'game.lossFinal': 'No spare lives remain; this ends the attempt.',
  'game.tieLoses': 'Ties lose.',

  'tile.window': 'Absorb at {{min}}–{{max}}',
  'tile.exactWindow': 'Absorb at exactly {{value}}',
  'rule.window':
    "Your value must be within the enemy's shown range to absorb it. Outside that range, the enemy gains your value. A spare life lets you return to the start; without one, the run ends.",

  'combat.tooHigh': 'Too high to absorb',
  'combat.tooLow': 'Too small to absorb',
  'combat.nextWindow': 'Next absorption range: {{min}}–{{max}}',

  'game.takeAdd': 'Take +{{value}}',
  'game.takeMultiply': 'Multiply by {{value}}',
  'game.takeSet': 'Set to {{value}}',
  'game.setLabel': 'Set tile to {{value}}',
  'game.absorbEnemy': 'Absorb enemy',
  'game.defeatBoss': 'Defeat boss',
  'game.bankButton': 'Bank {{value}}',
  'game.attackAnyway': 'Attack anyway',
  'game.blocked': 'Blocked: another object is in the way.',
  'game.cannotInteract': 'You cannot interact with this right now.',
  'game.stepsPreview': '+{{count}} steps',

  'result.winTitle': 'Level complete!',
  'result.results': 'Results',
  'result.lostTitle': 'Defeated',
  'result.lostBody':
    'No spare lives remain. Undo the last interaction or restart.',

  'hint.none': 'No hint available.',
  'hint.arithmeticOrder':
    'Arithmetic tiles work once. What value do you get if you add before multiplying? What if you reverse the order?',
  'hint.bankPlanning':
    'A failed attack adds your value to the enemy. With a spare life, you return to your starting value. Could you absorb the larger enemy on your next visit?',
  'hint.bossPlanning':
    'Work backwards from the boss. Which tiles could make your value larger than its value?',
  'hint.reachableTarget':
    'Look for an enemy you can reach with a value smaller than yours.',

  'hintAction.absorb': 'From the start, absorb the enemy with value {{value}}.',
  'hintAction.win': 'Defeat the boss with value {{value}}.',
  'hintAction.bank':
    'From the start, attack the enemy with value {{value}} to bank your {{player}}.',
  'hintAction.add': 'From the start, take the +{{value}} tile.',
  'hintAction.multiply': 'From the start, take the ×{{value}} tile.',
  'hintAction.set':
    'From the start, use the tile that sets your value to {{value}}.',

  'announce.absorb': 'Absorbed the enemy. Value {{value}}.',
  'announce.win': 'Boss defeated with final value {{value}}. You win!',
  'announce.add': 'Added. Value {{value}}.',
  'announce.multiply': 'Multiplied. Value {{value}}.',
  'announce.set': 'Value set to {{value}}.',
  'announce.respawn':
    'Banked. Enemy grew to {{enemy}}. Respawning with value {{value}}.',
  'announce.loss': 'Defeated. The attempt has ended.',
  'announce.undo': 'Undid the last interaction.',
  'announce.restart': 'Restarted the level.',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.lightPalette': 'Light theme',
  'settings.darkPalette': 'Dark theme',
  'settings.system': 'System',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.motion.reduce': 'Reduce motion',
  'settings.motion': 'Motion',
  'settings.theme': 'Theme',
  'settings.language': 'Language',

  'game.practiceCounter': 'Actions: {{actions}} · Proven minimum: {{minimum}}',

  'daily.loading': 'Loading…',
  'daily.error': "Couldn't load the puzzle. Please reopen the post.",
  'daily.play': "Play today's puzzle",
  'daily.best': 'Your best: {{steps}} steps',
  'daily.streak': '{{count}}-day streak',
  'daily.playAgain': 'Play again',
  'daily.restartConfirm':
    'Restart this puzzle?\nYour current run will be cleared.',
  'leaderboard.title': "Today's leaderboard",
  'leaderboard.empty': 'No completed runs yet.',
  'leaderboard.steps': '{{steps}} steps',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
