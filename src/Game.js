import * as THREE from 'three';
import { createRenderer, createScene, createCamera, setupLights, getViewportSize, getCameraProfile } from './scene.js';
import { Player } from './Player.js';
import { Creature } from './Creature.js';
import { Track } from './Track.js';
import { ObstacleManager } from './ObstacleManager.js';
import { GapManager } from './GapManager.js';
import { ChaseMusic, musicTierForDistance } from './ChaseMusic.js';
import { Sfx } from './Sfx.js';
import { Environment } from './Environment.js';
import { BoosterManager } from './BoosterManager.js';
import { BoosterEffects } from './BoosterEffects.js';
import { BoosterShop, SHOP_BOOSTER_TYPES } from './BoosterShop.js';
import { CoinManager } from './CoinManager.js';
import { DayCycle } from './DayCycle.js';
import { fetchTopScores, submitScore, startRunSession, isValidPlayerName, buildLeaderboardDisplayRows, formatLeaderboardDistance } from './Leaderboard.js';
import { applyRendererProfile } from './graphicsProfile.js';
import { runSpeedAtDistance } from '../shared/runPhysics.js';

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
    this.shop = new BoosterShop();
    this.boosters = new BoosterEffects(this.shop.getDurations());

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
    this.musicTier = 0;
    this.sessionCoins = 0;
    this.runToken = null;
    this.runActiveMs = 0;
    this.baseSpeed = 14;
    this.speed = this.baseSpeed;
    this.shakeIntensity = 0;
    this._needsRender = true;
    this._lastCamFov = 65;
    this._fallScreamPlayed = false;
    this.dayCycle = new DayCycle();
    this._cycleRimOpacity = 0.04;
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
      shopOpenBtn: document.getElementById('shop-open-btn'),
      shopModal: document.getElementById('shop-modal'),
      shopBackdrop: document.getElementById('shop-backdrop'),
      shopCloseBtn: document.getElementById('shop-close-btn'),
      shopCoinBalance: document.getElementById('shop-coin-balance'),
      speedFx: document.getElementById('speed-fx'),
      jumpFx: document.getElementById('jump-fx'),
      ghostFx: document.getElementById('ghost-fx'),
    };

    this.music.setEnabled(this.loadAudioPref(MUSIC_PREF_KEY, true));
    this.sfx.setEnabled(this.loadAudioPref(SFX_PREF_KEY, true));
    this.updateAudioToggleUI();

    this.bindInput();
    this.bindUI();
    this.loadPlayerName();
    this.updateBestScoreUI();
    this.updateShopUI();
    this.refreshLeaderboard();
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    this.applyDayCycleVisuals();
  }

  applyDayCycleVisuals() {
    const state = this.dayCycle.state;
    if (this.scene.fog) {
      this.scene.fog.color.setHex(state.fog);
      this.scene.fog.density = state.fogDensity;
    }
    this.lights.ambient.color.setHex(state.ambientColor);
    this.lights.ambient.intensity = state.ambientIntensity;
    this.lights.moon.color.setHex(state.moonColor);
    this.lights.moon.intensity = state.moonIntensity;
    this.lights.rim.material.color.setHex(state.rimColor);
    this._cycleRimOpacity = state.rimOpacity;
    this.lights.rim.material.opacity = this._cycleRimOpacity;
    this.renderer.toneMappingExposure = state.exposure;
    this.environment.applyDayCycle(state);
  }

  getTotalCoins() {
    return parseInt(localStorage.getItem(TOTAL_COINS_KEY) || '0', 10);
  }

  addCoins(amount) {
    this.sessionCoins += amount;
    const total = this.getTotalCoins() + amount;
    localStorage.setItem(TOTAL_COINS_KEY, String(total));
  }

  setTotalCoins(total) {
    localStorage.setItem(TOTAL_COINS_KEY, String(Math.max(0, total)));
  }

  syncBoosterDurations() {
    this.boosters.setDurations(this.shop.getDurations());
  }

  openShop() {
    if (this.state !== 'menu') return;
    this.shop.reload();
    this.syncBoosterDurations();
    this.updateShopUI();
    this.ui.shopModal?.classList.remove('hidden');
  }

  closeShop() {
    this.ui.shopModal?.classList.add('hidden');
  }

  isShopOpen() {
    return this.ui.shopModal && !this.ui.shopModal.classList.contains('hidden');
  }

  updateShopUI() {
    if (this.ui.shopCoinBalance) {
      this.ui.shopCoinBalance.textContent = String(this.getTotalCoins());
    }

    const totalCoins = this.getTotalCoins();
    for (const type of SHOP_BOOSTER_TYPES) {
      const item = this.ui.shopModal?.querySelector(`.shop-item[data-booster="${type}"]`);
      if (!item) continue;

      const levelEl = item.querySelector('[data-shop-level]');
      const durationEl = item.querySelector('[data-shop-duration]');
      const costEl = item.querySelector('[data-shop-cost]');
      const btn = item.querySelector('[data-shop-upgrade]');

      const level = this.shop.getLevel(type);
      const duration = this.shop.getDuration(type);
      const cost = this.shop.getCost(type);
      const maxed = this.shop.isMaxed(type);

      if (levelEl) levelEl.textContent = String(level);
      if (durationEl) durationEl.textContent = String(duration);
      if (costEl) costEl.textContent = maxed ? '—' : String(cost);
      if (btn) {
        btn.disabled = maxed || cost === null || totalCoins < cost;
        btn.textContent = maxed ? 'Maksimum' : `Satın al · ${cost}`;
      }
    }
  }

  purchaseBoosterUpgrade(type) {
    const result = this.shop.tryPurchase(type, this.getTotalCoins());
    if (!result.ok) return false;
    this.setTotalCoins(result.newTotal);
    this.syncBoosterDurations();
    this.updateShopUI();
    this.sfx.playCoinPickup();
    return true;
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
    list.classList.toggle('leaderboard-list--placeholder', error);

    if (error) {
      const rows = buildLeaderboardDisplayRows(scores, true);
      if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — placeholder rows', rows.length);
      for (const row of rows) {
        list.appendChild(this.createLeaderboardRow(row));
      }
      return;
    }

    if (scores.length === 0) {
      if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — empty list');
      this.ui.leaderboardEmpty?.classList.remove('hidden');
      return;
    }

    if (import.meta.env.DEV) console.log('[leaderboard] refreshLeaderboard — rows', scores.length);

    for (const row of buildLeaderboardDisplayRows(scores, false)) {
      list.appendChild(this.createLeaderboardRow(row));
    }
  }

  createLeaderboardRow(row) {
    const item = document.createElement('li');
    if (row.isPlaceholder) item.classList.add('leaderboard-placeholder');

    const rank = document.createElement('span');
    rank.className = 'rank';
    if (row.rank <= 3 && !row.isPlaceholder) {
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
    dist.textContent = formatLeaderboardDistance(row.distance);

    item.append(rank, name, dist);
    return item;
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
    const text = best > 0 ? `Rekorun: ${best}m` : '';
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
    this.ui.shopOpenBtn?.addEventListener('click', () => this.openShop());
    this.ui.shopCloseBtn?.addEventListener('click', () => this.closeShop());
    this.ui.shopBackdrop?.addEventListener('click', () => this.closeShop());
    this.ui.shopModal?.querySelectorAll('[data-shop-upgrade]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-shop-upgrade');
        if (type) this.purchaseBoosterUpgrade(type);
      });
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
    this.sfx.playBoosterPickup(type);
    if (type === 'speed') this.triggerSpeedFxFlash();
    else if (type === 'jump') this.triggerJumpFxFlash();
    else if (type === 'ghost') this.triggerGhostFxFlash();
    this.updateBoosterHUD();
  }

  updateSpeedFx() {
    const fx = this.ui.speedFx;
    if (!fx) return;
    const active = this.boosters.isSpeedActive();
    fx.classList.toggle('visible', active);
    fx.classList.toggle('hidden', !active);
    if (!active) fx.classList.remove('flash');
  }

  triggerSpeedFxFlash() {
    const fx = this.ui.speedFx;
    if (!fx) return;
    fx.classList.remove('hidden');
    fx.classList.add('visible', 'flash');
    clearTimeout(this._speedFxFlashTimer);
    this._speedFxFlashTimer = setTimeout(() => {
      fx.classList.remove('flash');
    }, 320);
  }

  hideSpeedFx() {
    clearTimeout(this._speedFxFlashTimer);
    const fx = this.ui.speedFx;
    if (!fx) return;
    fx.classList.add('hidden');
    fx.classList.remove('visible', 'flash');
  }

  updateJumpFx() {
    const fx = this.ui.jumpFx;
    if (!fx) return;
    const active = this.boosters.isSuperJumpActive();
    fx.classList.toggle('visible', active);
    fx.classList.toggle('hidden', !active);
    if (!active) fx.classList.remove('flash');
  }

  triggerJumpFxFlash() {
    const fx = this.ui.jumpFx;
    if (!fx) return;
    fx.classList.remove('hidden');
    fx.classList.add('visible', 'flash');
    clearTimeout(this._jumpFxFlashTimer);
    this._jumpFxFlashTimer = setTimeout(() => {
      fx.classList.remove('flash');
    }, 420);
  }

  hideJumpFx() {
    clearTimeout(this._jumpFxFlashTimer);
    const fx = this.ui.jumpFx;
    if (!fx) return;
    fx.classList.add('hidden');
    fx.classList.remove('visible', 'flash');
  }

  updateGhostFx() {
    const fx = this.ui.ghostFx;
    if (!fx) return;
    const active = this.boosters.isGhostActive();
    fx.classList.toggle('visible', active);
    fx.classList.toggle('hidden', !active);
    if (!active) fx.classList.remove('flash');
  }

  triggerGhostFxFlash() {
    const fx = this.ui.ghostFx;
    if (!fx) return;
    fx.classList.remove('hidden');
    fx.classList.add('visible', 'flash');
    clearTimeout(this._ghostFxFlashTimer);
    this._ghostFxFlashTimer = setTimeout(() => {
      fx.classList.remove('flash');
    }, 320);
  }

  hideGhostFx() {
    clearTimeout(this._ghostFxFlashTimer);
    const fx = this.ui.ghostFx;
    if (!fx) return;
    fx.classList.add('hidden');
    fx.classList.remove('visible', 'flash');
  }

  hideBoosterFx() {
    this.hideSpeedFx();
    this.hideJumpFx();
    this.hideGhostFx();
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

    this.updateSpeedFx();
    this.updateJumpFx();
    this.updateGhostFx();
  }

  bindInput() {
    this.keys = {};

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.isShopOpen()) {
          this.closeShop();
          return;
        }
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
          if (!this.player.startSlide()) this.player.fastFall();
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
    this._fallScreamPlayed = false;
    this.player.vy = 0;
    this.player.isSliding = false;
    this.player.slideTimer = 0;
    this.player.slideBlend = 0;
    this.player.resetVisuals();
  }

  updateMusicTier() {
    const tier = musicTierForDistance(this.distance);
    if (tier === this.musicTier) return;
    this.musicTier = tier;
    this.music.setTier(tier);
  }

  resetWorld() {
    this.distance = 0;
    this.musicTier = 0;
    this.music.setTier(0);
    this._fallScreamPlayed = false;
    this.runToken = null;
    this.runActiveMs = 0;
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
    this.dayCycle.reset();
    this.applyDayCycleVisuals();
    this.player.setGhostVisual(false);
    this.updateBoosterHUD();
    const profile = getCameraProfile(this.camera.aspect);
    this.camera.fov = profile.baseFov;
    this._lastCamFov = profile.baseFov;
    this.camera.updateProjectionMatrix();
  }

  async start() {
    if (!this.validatePlayerName()) {
      this.ui.playerNameInput?.focus();
      return;
    }
    this.savePlayerName(this.getPlayerName());
    this.closeShop();

    this.runToken = null;
    this.runActiveMs = 0;
    const session = await startRunSession();
    if (session?.token) this.runToken = session.token;

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
    this.closeShop();
    this.updateBestScoreUI();
    this.updateShopUI();
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
    if (!this.runToken) {
      if (import.meta.env.DEV) console.log('[leaderboard] skip submit — missing run token');
      return;
    }
    const ok = await submitScore(
      name,
      distance,
      this.runToken,
      Math.floor(this.runActiveMs)
    );
    this.runToken = null;
    if (import.meta.env.DEV) console.log('[leaderboard] submit result', { ok });
    if (ok) this.refreshLeaderboard();
  }

  gameOver(reason = 'caught') {
    this.state = 'gameover';
    this._needsRender = true;
    this.music.stop();
    this.hideBoosterFx();
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
        this.sessionCoins > 0 ? `${this.sessionCoins} altın topladın` : '';
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
      this.runActiveMs += dt * 1000;

      this.speed = runSpeedAtDistance(this.distance);
      this.boosters.update(dt);
      const runSpeed = this.speed * this.boosters.getSpeedMultiplier();
      this.distance += runSpeed * dt;
      this.updateMusicTier();

      this.track.update(dt, runSpeed);
      this.gaps.update(dt, runSpeed, this.distance);
      this.track.updateGapMask(this.gaps);
      this.obstacles.update(dt, runSpeed, this.distance);
      this.pickups.update(dt, runSpeed, this.camera);
      this.coins.update(dt, runSpeed);
      const wantsDown = this.keys['ArrowDown'] || this.keys['KeyS'];
      this.player.update(dt, this.gaps.hasFloorAt(0, this.player.laneIndex), wantsDown);
      this.player.setGhostVisual(this.boosters.isGhostActive());

      if (this.player.isFalling && !this._fallScreamPlayed) {
        this._fallScreamPlayed = true;
        this.sfx.playFallScream();
      }

      // Chase/danger ignores run speed — only hits (lunge) and stumbling pull the creature in.
      this.creature.update(dt, this.player.x, this.player.isStumbling);

      if (this.player.isFalling && this.player.y < -3) {
        this.gameOver('fell');
        return;
      }

      const hit = this.obstacles.checkCollision(this.player, runSpeed * dt);
      if (hit && !this.boosters.isGhostActive()) {
        this.applyHit(0);
        this.obstacles.removeObstacle(hit);
      }

      const pickup = this.pickups.checkCollection(
        this.player.x,
        this.player.laneIndex,
        this.player.y,
        this.player.isSliding
      );
      if (pickup) {
        this.collectBooster(pickup.type);
        this.pickups.removePickup(pickup);
      }

      const coin = this.coins.checkCollection(
        this.player.x,
        this.player.laneIndex,
        this.player.y,
        this.player.isSliding
      );
      if (coin) {
        this.collectCoin();
        this.coins.removeCoin(coin);
      }

      if (this.creature.hasCaught()) {
        this.gameOver('caught');
        return;
      }

      this.music.setDanger(this.creature.dangerLevel);
      this.dayCycle.setDistance(this.distance);
      this.applyDayCycleVisuals();
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

    this.lights.rim.material.opacity = this._cycleRimOpacity + danger * 0.08;
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
    applyRendererProfile(this.renderer);
    this._needsRender = true;
  }

  run() {
    this.loop();
  }
}
