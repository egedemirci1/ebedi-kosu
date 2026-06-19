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

vi.mock('../../src/ChaseMusic.js', () => ({
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
  },
}));

vi.mock('../../src/Sfx.js', () => ({
  Sfx: class MockSfx {
    constructor() {
      this.playJump = vi.fn();
      this.playWallHit = vi.fn();
      this.playObstacleHit = vi.fn();
      this.playBoosterPickup = vi.fn();
    }

    setEnabled() {}
    isEnabled() {
      return true;
    }
  },
}));

export async function createGameInstance() {
  setupGameDOM();
  const { Game } = await import('../../src/Game.js');
  return new Game();
}
