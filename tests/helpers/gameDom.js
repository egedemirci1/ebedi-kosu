const GAME_DOM_IDS = [
  'hud',
  'score',
  'coin-count',
  'danger-fill',
  'best-score',
  'start-screen',
  'pause-screen',
  'game-over-screen',
  'final-score',
  'final-coins',
  'best-score-gameover',
  'start-btn',
  'resume-btn',
  'menu-btn',
  'pause-hud-btn',
  'restart-btn',
  'gameover-menu-btn',
  'booster-ghost',
  'booster-jump',
  'booster-speed',
  'player-name',
  'player-name-error',
  'leaderboard-list',
  'leaderboard-empty',
  'leaderboard-error',
  'story-toast',
  'story-toast-milestone',
  'story-toast-text',
];

export function setupGameDOM() {
  for (const id of GAME_DOM_IDS) {
    if (document.getElementById(id)) continue;

    const el = id === 'player-name'
      ? document.createElement('input')
      : document.createElement('div');
    el.id = id;

    if (id.startsWith('booster-')) {
      el.innerHTML = '<span class="booster-time"></span>';
    }
    if (id === 'game-over-screen') {
      el.innerHTML = '<h1></h1>';
    }

    document.body.appendChild(el);
  }
}

export function clearGameDOM() {
  for (const id of GAME_DOM_IDS) {
    document.getElementById(id)?.remove();
  }
}
