export const GHOST_DURATION = 5;
export const SPEED_DURATION = 4;
export const SPEED_MULTIPLIER = 1.3;
export const SUPER_JUMP_VY = 13.8;

export class BoosterEffects {
  constructor() {
    this.ghostTimer = 0;
    this.speedTimer = 0;
    this.superJumpReady = false;
  }

  reset() {
    this.ghostTimer = 0;
    this.speedTimer = 0;
    this.superJumpReady = false;
  }

  isGhostActive() {
    return this.ghostTimer > 0;
  }

  isSpeedActive() {
    return this.speedTimer > 0;
  }

  getSpeedMultiplier() {
    return this.speedTimer > 0 ? SPEED_MULTIPLIER : 1;
  }

  activate(type) {
    switch (type) {
      case 'ghost':
        this.ghostTimer = GHOST_DURATION;
        break;
      case 'jump':
        this.superJumpReady = true;
        break;
      case 'speed':
        this.speedTimer = SPEED_DURATION;
        break;
      default:
        break;
    }
  }

  consumeSuperJump() {
    if (!this.superJumpReady) return false;
    this.superJumpReady = false;
    return true;
  }

  update(dt) {
    if (this.ghostTimer > 0) this.ghostTimer = Math.max(0, this.ghostTimer - dt);
    if (this.speedTimer > 0) this.speedTimer = Math.max(0, this.speedTimer - dt);
  }

  getHudState() {
    return {
      ghost: this.ghostTimer,
      speed: this.speedTimer,
      jump: this.superJumpReady,
    };
  }
}
