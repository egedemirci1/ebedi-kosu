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
    }

    setEnabled() {}
    isEnabled() {
      return true;
    }
  },
}));

vi.mock('../../src/Leaderboard.js', () => ({
  fetchTopScores: vi.fn(async () => ({ scores: [], error: false })),
  submitScore: vi.fn(async () => true),
  isValidPlayerName: (name) => {
    const trimmed = String(name ?? '').trim();
    return trimmed.length >= 2 && trimmed.length <= 20;
  },
}));

export async function createGameInstance() {
  setupGameDOM();
  const { Game } = await import('../../src/Game.js');
  return new Game();
}
