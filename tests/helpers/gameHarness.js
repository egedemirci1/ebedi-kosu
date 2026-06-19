import { vi } from 'vitest';
import { setupGameDOM } from './gameDom.js';

vi.mock('../../src/scene.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createRenderer: () => ({
      domElement: document.createElement('canvas'),
      render: vi.fn(),
      setSize: vi.fn(),
    }),
  };
});

vi.mock('../../src/ChaseMusic.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ChaseMusic: class MockChaseMusic {
      constructor() {
        this._enabled = true;
      }

      setEnabled(on) {
        this._enabled = on;
      }

      isEnabled() {
        return this._enabled;
      }

      start() {}
      pause() {}
      resume() {}
      stop() {}
      setDanger() {}
      setTier() {}
      setProfile() {}
    },
  };
});

vi.mock('../../src/Sfx.js', () => ({
  Sfx: class MockSfx {
    constructor() {
      this.playJump = vi.fn();
      this.playWallHit = vi.fn();
      this.playObstacleHit = vi.fn();
      this.playBoosterPickup = vi.fn();
      this.playCoinPickup = vi.fn();
      this.playFallScream = vi.fn();
      this.playSlide = vi.fn();
      this.playSlideSkid = vi.fn();
    }

    setEnabled() {}
    isEnabled() {
      return true;
    }
  },
}));

vi.mock('../../src/Leaderboard.js', () => ({
  fetchTopScores: vi.fn(async () => ({ scores: [], error: false })),
  startRunSession: vi.fn(async () => ({ token: 'test-token', expiresAt: Date.now() + 60_000 })),
  submitScore: vi.fn(async () => true),
  isValidPlayerName: (name) => {
    const trimmed = String(name ?? '').trim();
    if (trimmed.length < 2 || trimmed.length > 20) return false;
    return /^[\p{L}\p{N}_\-. ]+$/u.test(trimmed);
  },
}));

export async function createGameInstance() {
  setupGameDOM();
  const { Game } = await import('../../src/Game.js');
  return new Game();
}
