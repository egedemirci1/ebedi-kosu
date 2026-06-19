export const GHOST_DURATION = 5;
export const JUMP_DURATION = 5;
export const SPEED_DURATION = 4;
export const SPEED_MULTIPLIER = 1.3;
export const SUPER_JUMP_VY = 13.8;

export class BoosterEffects {
  constructor(durations) {
    this.durations = {
      ghost: GHOST_DURATION,
      jump: JUMP_DURATION,
      speed: SPEED_DURATION,
      ...durations,
    };
    this.ghostTimer = 0;
    this.jumpTimer = 0;
    this.speedTimer = 0;
  }

  setDurations(durations) {
    Object.assign(this.durations, durations);
  }

  reset() {
    this.ghostTimer = 0;
    this.jumpTimer = 0;
    this.speedTimer = 0;
  }

  isGhostActive() {
    return this.ghostTimer > 0;
  }

  isSuperJumpActive() {
    return this.jumpTimer > 0;
  }

  isSpeedActive() {
    return this.speedTimer > 0;
  }

  getSpeedMultiplier() {
    return this.speedTimer > 0 ? SPEED_MULTIPLIER : 1;
  }

  activate(type) {
    const duration = this.durations[type];
    if (!duration) return;
    switch (type) {
      case 'ghost':
        this.ghostTimer = duration;
        break;
      case 'jump':
        this.jumpTimer = duration;
        break;
      case 'speed':
        this.speedTimer = duration;
        break;
      default:
        break;
    }
  }

  update(dt) {
    if (this.ghostTimer > 0) this.ghostTimer = Math.max(0, this.ghostTimer - dt);
    if (this.jumpTimer > 0) this.jumpTimer = Math.max(0, this.jumpTimer - dt);
    if (this.speedTimer > 0) this.speedTimer = Math.max(0, this.speedTimer - dt);
  }

  getHudState() {
    return {
      ghost: this.ghostTimer,
      speed: this.speedTimer,
      jump: this.jumpTimer,
    };
  }
}
