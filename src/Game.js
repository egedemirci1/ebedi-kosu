import * as THREE from 'three';
import { createRenderer, createScene, createCamera, setupLights, getViewportSize, getCameraProfile } from './scene.js';
import { Player } from './Player.js';
import { Creature } from './Creature.js';
import { Track } from './Track.js';
import { ObstacleManager } from './ObstacleManager.js';
import { GapManager } from './GapManager.js';
import { ChaseMusic } from './ChaseMusic.js';
import { Sfx } from './Sfx.js';
import { Environment } from './Environment.js';
import { BoosterManager } from './BoosterManager.js';
import { BoosterEffects } from './BoosterEffects.js';
import { CoinManager } from './CoinManager.js';
import { fetchTopScores, submitScore, isValidPlayerName } from './Leaderboard.js';

const HIGH_SCORE_KEY = 'ebedi-kosu-best';
const TOTAL_COINS_KEY = 'ebedi-kosu-total-coins';
const PLAYER_NAME_KEY = 'ebedi-kosu-player-name';
const MUSIC_PREF_KEY = 'ebedi-kosu-music';
const SFX_PREF_KEY = 'ebedi-kosu-sfx';

export class Game {
  constructor() {
    this.renderer = createRenderer();
    this.scene = createScene();
    this.camera = createCamera();
    this.lights = setupLights(this.scene);
    this.environment = new Environment(this.scene);

    this.player = new Player(this.scene);
    this.creature = new Creature(this.scene);
    this.track = new Track(this.scene);
    this.obstacles = new ObstacleManager(this.scene);
    this.gaps = new GapManager(this.scene);
    this.gaps.setTrack(this.track);
    this.pickups = new BoosterManager(this.scene);
    this.coins = new CoinManager(this.scene);
    this.boosters = new BoosterEffects();

    this.obstacles.setGapManager(this.gaps);
    this.gaps.setObstacleManager(this.obstacles);
    this.gaps.setPickupManager(this.pickups);
    this.gaps.setCoinManager(this.coins);
    this.pickups.setGapManager(this.gaps);
    this.pickups.setObstacleManager(this.obstacles);
    this.pickups.setBoosterEffects(this.boosters);
    this.pickups.setCoinManager(this.coins);
    this.coins.setGapManager(this.gaps);
    this.coins.setObstacleManager(this.obstacles);
    this.coins.setPickupManager(this.pickups);

    this.state = 'menu';
    this.distance = 0;
    this.sessionCoins = 0;
    this.baseSpeed = 14;
    this.speed = this.baseSpeed;
    this.shakeIntensity = 0;
    this._needsRender = true;
    this._lastCamFov = 65;
    this.clock = new THREE.Clock();
    this.music = new ChaseMusic();
    this.sfx = new Sfx(this.music);

    this.ui = {
      hud: document.getElementById('hud'),
      score: document.getElementById('score'),
      coinCount: document.getElementById('coin-count'),
      dangerFill: document.getElementById('danger-fill'),
      bestScore: document.getElementById('best-score'),
      startScreen: document.getElementById('start-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      gameOverScreen: document.getElementById('game-over-screen'),
      finalScore: document.getElementById('final-score'),
      finalCoins: document.getElementById('final-coins'),
      bestScoreGameOver: document.getElementById('best-score-gameover'),
      startBtn: document.getElementById('start-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      menuBtn: document.getElementById('menu-btn'),
      pauseHudBtn: document.getElementById('pause-hud-btn'),
      restartBtn: document.getElementById('restart-btn'),
      gameOverMenuBtn: document.getElementById('gameover-menu-btn'),
      boosterGhost: document.getElementById('booster-ghost'),
      boosterJump: document.getElementById('booster-jump'),
      boosterSpeed: document.getElementById('booster-speed'),
      playerNameInput: document.getElementById('player-name'),
      playerNameError: document.getElementById('player-name-error'),
      leaderboardList: document.getElementById('leaderboard-list'),
      leaderboardEmpty: document.getElementById('leaderboard-empty'),
      leaderboardError: document.getElementById('leaderboard-error'),
    };

    this.music.setEnabled(this.loadAudioPref(MUSIC_PREF_KEY, true));
    this.sfx.setEnabled(this.loadAudioPref(SFX_PREF_KEY, true));
    this.updateAudioToggleUI();

    this.bindInput();
    this.bindUI();
    this.loadPlayerName();
    this.updateBestScoreUI();
    this.refreshLeaderboard();
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  getTotalCoins() {
    return parseInt(localStorage.getItem(TOTAL_COINS_KEY) || '0', 10);
  }

  addCoins(amount) {
    this.sessionCoins += amount;
    const total = this.getTotalCoins() + amount;
    localStorage.setItem(TOTAL_COINS_KEY, String(total));
  }

  getBestScore() {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);
  }

  getPlayerName() {
    return (this.ui.playerNameInput?.value ?? '').trim();
  }

  loadPlayerName() {
    const saved = localStorage.getItem(PLAYER_NAME_KEY);
    if (saved && this.ui.playerNameInput) {
      this.ui.playerNameInput.value = saved;
    }
  }

  savePlayerName(name) {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  }

  setPlayerNameError(visible) {
    this.ui.playerNameInput?.classList.toggle('invalid', visible);
    this.ui.playerNameError?.classList.toggle('hidden', !visible);
  }

  validatePlayerName() {
    const name = this.getPlayerName();
    const valid = isValidPlayerName(name);
    this.setPlayerNameError(!valid);
    return valid;
  }

  async refreshLeaderboard() {
    if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard');
    const { scores, error } = await fetchTopScores();
    const list = this.ui.leaderboardList;
    if (!list) {
      if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — #leaderboard-list missing');
      return;
    }

    list.innerHTML = '';
    this.ui.leaderboardEmpty?.classList.add('hidden');
    this.ui.leaderboardError?.classList.add('hidden');

    if (error) {
      this.ui.leaderboardError?.classList.remove('hidden');
      return;
    }

    if (scores.length === 0) {
      if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — empty list');
      this.ui.leaderboardEmpty?.classList.remove('hidden');
      return;
    }

    if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — rows', scores.length);

    for (const row of scores) {
      const item = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      if (row.rank <= 3) {
        rank.classList.add('rank-medal', `rank-medal-${row.rank}`);
        rank.textContent = String(row.rank);
      } else {
        rank.textContent = `${row.rank}.`;
      }
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = row.player_name;
      const dist = document.createElement('span');
      dist.className = 'dist';
      dist.textContent = `${row.distance}m`;
      item.append(rank, name, dist);
      list.appendChild(item);
    }
  }

  loadAudioPref(key, defaultValue) {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === '1';
  }

  saveAudioPref(key, enabled) {
    localStorage.setItem(key, enabled ? '1' : '0');
  }

  updateAudioToggleUI() {
    const musicOn = this.music.isEnabled();
    const sfxOn = this.sfx.isEnabled();
    document.querySelectorAll('.audio-toggle-music').forEach((btn) => {
      this.setAudioToggleState(btn, musicOn);
    });
    document.querySelectorAll('.audio-toggle-sfx').forEach((btn) => {
      this.setAudioToggleState(btn, sfxOn);
    });
  }

  setAudioToggleState(button, enabled) {
    if (!button) return;
    button.classList.toggle('is-off', !enabled);
    button.setAttribute('aria-pressed', String(enabled));
    const state = button.querySelector('.audio-toggle-state');
    if (state) state.textContent = enabled ? 'Açık' : 'Kapalı';
  }

  toggleMusic() {
    const enabled = !this.music.isEnabled();
    this.music.setEnabled(enabled);
    this.saveAudioPref(MUSIC_PREF_KEY, enabled);
    this.updateAudioToggleUI();
  }

  toggleSfx() {
    const enabled = !this.sfx.isEnabled();
    this.sfx.setEnabled(enabled);
    this.saveAudioPref(SFX_PREF_KEY, enabled);
    this.updateAudioToggleUI();
  }

  saveBestScore(distance) {
    const score = Math.floor(distance);
    if (score > this.getBestScore()) {
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
    }
  }

  updateBestScoreUI() {
    const best = this.getBestScore();
    const text = best > 0 ? `En iyi: ${best}m` : '';
    if (this.ui.bestScore) this.ui.bestScore.textContent = text;
  }

  bindUI() {
    this.ui.startBtn?.addEventListener('click', () => this.start());
    this.ui.restartBtn?.addEventListener('click', () => this.start());
    this.ui.playerNameInput?.addEventListener('input', () => {
      if (isValidPlayerName(this.getPlayerName())) this.setPlayerNameError(false);
    });
    this.ui.playerNameInput?.addEventListener('blur', () => {
      const name = this.getPlayerName();
      if (isValidPlayerName(name)) this.savePlayerName(name);
    });
    this.ui.playerNameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.start();
    });
    this.ui.resumeBtn?.addEventListener('click', () => this.resume());
    this.ui.menuBtn?.addEventListener('click', () => this.goToMenu());
    this.ui.pauseHudBtn?.addEventListener('click', () => {
      if (this.state === 'playing') this.pause();
    });
    this.ui.gameOverMenuBtn?.addEventListener('click', () => this.goToMenu());
    document.querySelectorAll('.audio-toggle-music').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleMusic());
    });
    document.querySelectorAll('.audio-toggle-sfx').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleSfx());
    });
  }

  isOppositePressed(code) {
    const left = this.keys['ArrowLeft'] || this.keys['KeyA'];
    const right = this.keys['ArrowRight'] || this.keys['KeyD'];
    if (['ArrowLeft', 'KeyA'].includes(code) && right) return true;
    if (['ArrowRight', 'KeyD'].includes(code) && left) return true;
    return false;
  }

  tryJump() {
    const superJump = this.boosters.isSuperJumpActive();
    if (this.player.jump(superJump)) {
      this.sfx.playJump();
    }
  }

  collectBooster(type) {
    this.boosters.activate(type);
    this.sfx.playBoosterPickup();
    this.updateBoosterHUD();
  }

  collectCoin() {
    this.addCoins(1);
    this.sfx.playCoinPickup();
    this.updateUI();
  }

  updateBoosterHUD() {
    const state = this.boosters.getHudState();

    if (this.ui.boosterGhost) {
      this.ui.boosterGhost.classList.toggle('active', state.ghost > 0);
      const time = this.ui.boosterGhost.querySelector('.booster-time');
      if (time) time.textContent = state.ghost > 0 ? `${state.ghost.toFixed(1)}s` : '';
    }

    if (this.ui.boosterJump) {
      this.ui.boosterJump.classList.toggle('active', state.jump > 0);
      const time = this.ui.boosterJump.querySelector('.booster-time');
      if (time) time.textContent = state.jump > 0 ? `${state.jump.toFixed(1)}s` : '';
    }

    if (this.ui.boosterSpeed) {
      this.ui.boosterSpeed.classList.toggle('active', state.speed > 0);
      const time = this.ui.boosterSpeed.querySelector('.booster-time');
      if (time) time.textContent = state.speed > 0 ? `${state.speed.toFixed(1)}s` : '';
    }
  }

  bindInput() {
    this.keys = {};

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
        return;
      }

      this.keys[e.code] = true;

      if (this.state !== 'playing' || e.repeat || this.isOppositePressed(e.code)) return;

      if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        this.handleMove(this.player.moveLeft(), -1);
      }
      if (['ArrowRight', 'KeyD'].includes(e.code)) {
        this.handleMove(this.player.moveRight(), 1);
      }
      if (['ArrowUp', 'Space', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        this.tryJump();
      }
      if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    let touchStartX = 0;
    let touchStartY = 0;

    window.addEventListener(
      'touchstart',
      (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    window.addEventListener(
      'touchend',
      (e) => {
        if (this.state !== 'playing') return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 40) this.handleMove(this.player.moveRight(), 1);
          else if (dx < -40) this.handleMove(this.player.moveLeft(), -1);
        } else if (dy < -40) {
          this.tryJump();
        } else if (dy > 40) {
          this.player.fastFall();
        }
      },
      { passive: true }
    );
  }

  handleMove(result, wallSide) {
    if (result === 'wall') this.applyHit(wallSide);
  }

  applyHit(wallSide = 0) {
    if (wallSide === 0 && this.boosters.isGhostActive()) return;

    if (wallSide !== 0) {
      this.sfx.playWallHit(wallSide);
    } else {
      this.sfx.playObstacleHit();
    }
    this.player.stumble(0.6, wallSide);
    this.creature.lunge(3);
    this.shakeIntensity = 0.3;
  }

  resetPlayerState() {
    this.player.laneIndex = 1;
    this.player.targetX = 0;
    this.player.x = 0;
    this.player.y = 0;
    this.player.isJumping = false;
    this.player.isStumbling = false;
    this.player.stumbleSide = 0;
    this.player.wallBounceTimer = 0;
    this.player.wallBounceSide = 0;
    this.player.onGround = true;
    this.player.isFalling = false;
    this.player.vy = 0;
    this.player.resetVisuals();
  }

  resetWorld() {
    this.distance = 0;
    this.sessionCoins = 0;
    this.speed = this.baseSpeed;
    this.shakeIntensity = 0;
    this.resetPlayerState();
    this.creature.reset();
    this.track.reset();
    this.obstacles.reset();
    this.gaps.reset();
    this.boosters.reset();
    this.pickups.reset();
    this.coins.reset();
    this.environment.reset();
    this.player.setGhostVisual(false);
    this.updateBoosterHUD();
    const profile = getCameraProfile(this.camera.aspect);
    this.camera.fov = profile.baseFov;
    this._lastCamFov = profile.baseFov;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (!this.validatePlayerName()) {
      this.ui.playerNameInput?.focus();
      return;
    }
    this.savePlayerName(this.getPlayerName());

    this.music.start();
    this.state = 'playing';
    this._needsRender = true;
    this.resetWorld();

    this.ui.startScreen.classList.add('hidden');
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.gameOverScreen.querySelector('h1').textContent = 'YAKALANDIN!';
    this.ui.hud.classList.add('visible');
    this.clock.getDelta();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._needsRender = true;
    this.music.pause();
    this.ui.pauseScreen.classList.remove('hidden');
    this.updateAudioToggleUI();
    this.clock.getDelta();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this._needsRender = true;
    this.music.resume();
    this.ui.pauseScreen.classList.add('hidden');
    this.clock.getDelta();
  }

  goToMenu() {
    this.state = 'menu';
    this._needsRender = true;
    this.music.stop();
    this.resetWorld();
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.hud.classList.remove('visible');
    this.ui.startScreen.classList.remove('hidden');
    this.updateBestScoreUI();
    this.refreshLeaderboard();
    this.clock.getDelta();
  }

  async submitScoreToLeaderboard() {
    const name = this.getPlayerName();
    const distance = Math.floor(this.distance);
    if (import.meta.env.DEV) {
      console.log('[leaderboard] submitScoreToLeaderboard', { name, distance });
    }
    if (distance < 1) {
      if (import.meta.env.DEV) console.log('[leaderboard] skip submit — distance < 1');
      return;
    }
    const ok = await submitScore(name, distance);
    if (import.meta.env.DEV) console.log('[leaderboard] submit result', { ok });
    if (ok) this.refreshLeaderboard();
  }

  gameOver(reason = 'caught') {
    this.state = 'gameover';
    this._needsRender = true;
    this.music.stop();
    this.saveBestScore(this.distance);
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.hud.classList.remove('visible');
    this.shakeIntensity = 0.5;

    const messages = {
      caught: 'YAKALANDIN!',
      fell: 'BOŞLUĞA DÜŞTÜN!',
    };
    this.ui.gameOverScreen.querySelector('h1').textContent = messages[reason] || messages.caught;
    this.ui.finalScore.textContent = `${Math.floor(this.distance)} metre koştun`;
    if (this.ui.finalCoins) {
      this.ui.finalCoins.textContent =
        this.sessionCoins > 0 ? `${this.sessionCoins} coin topladın` : '';
    }

    const best = this.getBestScore();
    if (this.ui.bestScoreGameOver) {
      this.ui.bestScoreGameOver.textContent =
        best > 0 ? `En iyi skor: ${best}m` : '';
    }

    this.updateBestScoreUI();
    this.ui.gameOverScreen.classList.remove('hidden');
    this.submitScoreToLeaderboard();
  }

  update(dt) {
    if (this.state === 'playing') {
      dt = Math.min(dt, 0.05);

      this.speed = this.baseSpeed + this.distance * 0.008;
      this.boosters.update(dt);
      const runSpeed = this.speed * this.boosters.getSpeedMultiplier();
      this.distance += runSpeed * dt;

      this.track.update(dt, runSpeed);
      this.gaps.update(dt, runSpeed, this.distance);
      this.track.updateGapMask(this.gaps);
      this.obstacles.update(dt, runSpeed, this.distance);
      this.pickups.update(dt, runSpeed);
      this.coins.update(dt, runSpeed);
      const fastFall = this.keys['ArrowDown'] || this.keys['KeyS'];
      this.player.update(dt, !this.gaps.isGapAt(0), fastFall);
      this.player.setGhostVisual(this.boosters.isGhostActive());
      // Chase/danger ignores run speed — only hits (lunge) and stumbling pull the creature in.
      this.creature.update(dt, this.player.x, this.player.isStumbling);

      if (this.player.isFalling && this.player.y < -3) {
        this.gameOver('fell');
        return;
      }

      const hit = this.obstacles.checkCollision(this.player);
      if (hit && !this.boosters.isGhostActive()) {
        this.applyHit(0);
        this.obstacles.removeObstacle(hit);
      }

      const pickup = this.pickups.checkCollection(this.player.x, this.player.laneIndex);
      if (pickup) {
        this.collectBooster(pickup.type);
        this.pickups.removePickup(pickup);
      }

      const coin = this.coins.checkCollection(this.player.x, this.player.laneIndex);
      if (coin) {
        this.collectCoin();
        this.coins.removeCoin(coin);
      }

      if (this.creature.hasCaught()) {
        this.gameOver('caught');
        return;
      }

      this.music.setDanger(this.creature.dangerLevel);
      this.environment.update(dt, runSpeed, this.camera);
      this.updateCamera(dt);
      this.updateUI();
      this.updateBoosterHUD();
      this._needsRender = true;
    }
  }

  render() {
    if (!this._needsRender) return;
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'playing') {
      this._needsRender = false;
    }
  }

  loop() {
    const dt = this.clock.getDelta();
    this.update(dt);
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  updateCamera(dt) {
    const danger = this.creature.dangerLevel;
    const profile = getCameraProfile(this.camera.aspect);
    const targetY = profile.baseY + danger * 0.5;
    const targetZ = profile.baseZ - danger * 1.5;
    const fov = profile.baseFov + danger * 8;

    this.camera.position.y += (targetY - this.camera.position.y) * dt * 3;
    this.camera.position.z += (targetZ - this.camera.position.z) * dt * 3;
    this.camera.fov += (fov - this.camera.fov) * dt * 3;
    if (Math.abs(this.camera.fov - this._lastCamFov) > 0.05) {
      this.camera.updateProjectionMatrix();
      this._lastCamFov = this.camera.fov;
    }

    const lookY = 1.5 + this.player.y * 0.5;
    this.camera.lookAt(this.player.x * 0.3, lookY, profile.lookZ);

    if (this.shakeIntensity > 0) {
      this.camera.position.x = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
    } else {
      this.camera.position.x *= 0.9;
    }

    this.lights.rim.material.opacity = 0.04 + danger * 0.1;
    this.lights.rim.position.set(
      this.player.x * 0.2,
      4.5 + danger * 0.5,
      this.creature.group.position.z + 3
    );
  }

  updateUI() {
    this.ui.score.textContent = Math.floor(this.distance);
    if (this.ui.coinCount) this.ui.coinCount.textContent = String(this.sessionCoins);
    const pct = this.creature.dangerLevel * 100;
    this.ui.dangerFill.style.width = `${pct}%`;
  }

  onResize() {
    const { width, height } = getViewportSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this._lastCamFov = this.camera.fov;
    this.renderer.setSize(width, height);
    this._needsRender = true;
  }

  run() {
    this.loop();
  }
}
