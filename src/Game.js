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

const HIGH_SCORE_KEY = 'ebedi-kosu-best';
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

    this.obstacles.setGapManager(this.gaps);
    this.gaps.setObstacleManager(this.obstacles);

    this.state = 'menu';
    this.distance = 0;
    this.baseSpeed = 14;
    this.speed = this.baseSpeed;
    this.shakeIntensity = 0;
    this.clock = new THREE.Clock();
    this.music = new ChaseMusic();
    this.sfx = new Sfx();

    this.ui = {
      hud: document.getElementById('hud'),
      score: document.getElementById('score'),
      dangerFill: document.getElementById('danger-fill'),
      bestScore: document.getElementById('best-score'),
      startScreen: document.getElementById('start-screen'),
      pauseScreen: document.getElementById('pause-screen'),
      gameOverScreen: document.getElementById('game-over-screen'),
      finalScore: document.getElementById('final-score'),
      bestScoreGameOver: document.getElementById('best-score-gameover'),
      startBtn: document.getElementById('start-btn'),
      resumeBtn: document.getElementById('resume-btn'),
      menuBtn: document.getElementById('menu-btn'),
      pauseHudBtn: document.getElementById('pause-hud-btn'),
      restartBtn: document.getElementById('restart-btn'),
      gameOverMenuBtn: document.getElementById('gameover-menu-btn'),
    };

    this.music.setEnabled(this.loadAudioPref(MUSIC_PREF_KEY, true));
    this.sfx.setEnabled(this.loadAudioPref(SFX_PREF_KEY, true));
    this.updateAudioToggleUI();

    this.bindInput();
    this.bindUI();
    this.updateBestScoreUI();
    window.addEventListener('resize', () => this.onResize());
    window.visualViewport?.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  getBestScore() {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);
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
    this.ui.startBtn.addEventListener('click', () => this.start());
    this.ui.restartBtn.addEventListener('click', () => this.start());
    this.ui.resumeBtn.addEventListener('click', () => this.resume());
    this.ui.menuBtn.addEventListener('click', () => this.goToMenu());
    this.ui.pauseHudBtn.addEventListener('click', () => {
      if (this.state === 'playing') this.pause();
    });
    this.ui.gameOverMenuBtn.addEventListener('click', () => this.goToMenu());
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
    if (this.player.jump()) this.sfx.playJump();
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
        }
      },
      { passive: true }
    );
  }

  handleMove(result, wallSide) {
    if (result === 'wall') this.applyHit(wallSide);
  }

  applyHit(wallSide = 0) {
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
    this.speed = this.baseSpeed;
    this.shakeIntensity = 0;
    this.resetPlayerState();
    this.creature.reset();
    this.track.reset();
    this.obstacles.reset();
    this.gaps.reset();
    this.environment.reset();
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
  }

  start() {
    this.music.start();
    this.state = 'playing';
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
    this.music.pause();
    this.ui.pauseScreen.classList.remove('hidden');
    this.updateAudioToggleUI();
    this.clock.getDelta();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.music.resume();
    this.ui.pauseScreen.classList.add('hidden');
    this.clock.getDelta();
  }

  goToMenu() {
    this.state = 'menu';
    this.music.stop();
    this.resetWorld();
    this.ui.pauseScreen.classList.add('hidden');
    this.ui.gameOverScreen.classList.add('hidden');
    this.ui.hud.classList.remove('visible');
    this.ui.startScreen.classList.remove('hidden');
    this.updateBestScoreUI();
    this.clock.getDelta();
  }

  gameOver(reason = 'caught') {
    this.state = 'gameover';
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

    const best = this.getBestScore();
    if (this.ui.bestScoreGameOver) {
      this.ui.bestScoreGameOver.textContent =
        best > 0 ? `En iyi skor: ${best}m` : '';
    }

    this.updateBestScoreUI();
    this.ui.gameOverScreen.classList.remove('hidden');
  }

  update(dt) {
    if (this.state !== 'playing') return;

    dt = Math.min(dt, 0.05);

    this.speed = this.baseSpeed + this.distance * 0.008;
    this.distance += this.speed * dt;

    this.track.update(dt, this.speed);
    this.gaps.update(dt, this.speed, this.distance);
    this.obstacles.update(dt, this.speed, this.distance);
    this.player.update(dt, !this.gaps.isGapAt(0));
    this.creature.update(dt, this.player.x, this.speed, this.player.isStumbling);

    if (this.player.isFalling && this.player.y < -3) {
      this.gameOver('fell');
      return;
    }

    const hit = this.obstacles.checkCollision(this.player);
    if (hit) {
      this.applyHit(0);
      hit.active = false;
      this.scene.remove(hit.mesh);
      hit.mesh.geometry.dispose();
    }

    if (this.creature.hasCaught()) {
      this.gameOver('caught');
    }

    this.music.setDanger(this.creature.dangerLevel);
    this.environment.update(dt, this.speed, this.camera);
    this.updateCamera(dt);
    this.updateUI();
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
    this.camera.updateProjectionMatrix();

    const lookY = 1.5 + this.player.y * 0.5;
    this.camera.lookAt(this.player.x * 0.3, lookY, profile.lookZ);

    if (this.shakeIntensity > 0) {
      this.camera.position.x = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= 0.9;
      if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
    } else {
      this.camera.position.x *= 0.9;
    }

    this.lights.rim.intensity = 1 + danger * 2;

    const moon = this.lights.moon;
    moon.target.position.set(this.player.x * 0.4, 0, -40);
    moon.target.updateMatrixWorld();
  }

  updateUI() {
    this.ui.score.textContent = Math.floor(this.distance);
    const pct = this.creature.dangerLevel * 100;
    this.ui.dangerFill.style.width = `${pct}%`;
  }

  onResize() {
    const { width, height } = getViewportSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  loop() {
    const dt = this.clock.getDelta();
    this.update(dt);
    this.render();
    requestAnimationFrame(() => this.loop());
  }

  run() {
    this.loop();
  }
}
