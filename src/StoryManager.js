import { findNewStoryBeat, formatStoryMilestone } from '../shared/storyBeats.js';

export const STORY_DISPLAY_SECONDS = 4.5;

export class StoryManager {
  /**
   * @param {{ toast: HTMLElement, milestone: HTMLElement, text: HTMLElement }} ui
   */
  constructor(ui) {
    this.toast = ui.toast;
    this.milestone = ui.milestone;
    this.text = ui.text;
    this.shown = new Set();
    this.queue = [];
    this.displayTimer = 0;
  }

  reset() {
    this.shown.clear();
    this.queue.length = 0;
    this.displayTimer = 0;
    this.hide();
  }

  /**
   * @param {number} distance
   * @param {number} dt
   */
  update(distance, dt) {
    if (this.displayTimer > 0) {
      this.displayTimer -= dt;
      if (this.displayTimer <= 0) {
        this.hide();
      }
    }

    this.enqueueCrossedBeats(distance);

    if (this.displayTimer <= 0 && this.queue.length > 0) {
      this.show(this.queue.shift());
    }
  }

  /**
   * @param {number} distance
   */
  enqueueCrossedBeats(distance) {
    let beat = findNewStoryBeat(distance, this.shown);
    while (beat) {
      this.shown.add(beat.distance);
      this.queue.push(beat);
      beat = findNewStoryBeat(distance, this.shown);
    }
  }

  /**
   * @param {{ distance: number, text: string }} beat
   */
  show(beat) {
    if (!this.toast || !this.milestone || !this.text) return;

    this.milestone.textContent = formatStoryMilestone(beat.distance);
    this.text.textContent = beat.text;
    this.toast.classList.remove('hidden');
    this.toast.classList.add('visible');
    this.displayTimer = STORY_DISPLAY_SECONDS;
  }

  hide() {
    if (!this.toast) return;
    this.toast.classList.remove('visible');
    this.toast.classList.add('hidden');
    this.displayTimer = 0;
  }
}
