import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  STORY_BEATS,
  findNewStoryBeat,
  formatStoryMilestone,
} from '../../shared/storyBeats.js';

describe('storyBeats', () => {
  it('lists beats in ascending distance order', () => {
    const distances = STORY_BEATS.map((beat) => beat.distance);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
  });

  it('returns the next unshown beat once distance is reached', () => {
    const shown = new Set();
    expect(findNewStoryBeat(999, shown)).toBeNull();
    expect(findNewStoryBeat(1000, shown)?.distance).toBe(1000);
    shown.add(1000);
    expect(findNewStoryBeat(2500, shown)).toBeNull();
    expect(findNewStoryBeat(3000, shown)?.distance).toBe(3000);
  });

  it('formats milestone labels for Turkish locale', () => {
    expect(formatStoryMilestone(10000)).toBe('10.000 m');
  });
});

describe('StoryManager', () => {
  let toast;
  let milestone;
  let text;
  /** @type {import('../../src/StoryManager.js').StoryManager} */
  let story;

  beforeEach(async () => {
    toast = document.createElement('div');
    milestone = document.createElement('p');
    text = document.createElement('p');
    document.body.appendChild(toast);
    document.body.appendChild(milestone);
    document.body.appendChild(text);

    const { StoryManager } = await import('../../src/StoryManager.js');
    story = new StoryManager({ toast, milestone, text });
  });

  afterEach(() => {
    toast.remove();
    milestone.remove();
    text.remove();
  });

  it('shows a beat once and hides after the display timer', () => {
    story.update(1000, 0);
    expect(toast.classList.contains('visible')).toBe(true);
    expect(milestone.textContent).toBe('1.000 m');
    expect(text.textContent).toContain('Koşmaya başladın');

    story.update(1200, 5);
    expect(toast.classList.contains('hidden')).toBe(true);
    expect(story.shown.has(1000)).toBe(true);
  });

  it('queues multiple beats if they are crossed while one is visible', () => {
    story.update(5000, 0);
    expect(toast.classList.contains('visible')).toBe(true);
    expect(story.queue).toHaveLength(2);
    expect(story.shown.has(1000)).toBe(true);
    expect(story.shown.has(3000)).toBe(true);
    expect(story.shown.has(5000)).toBe(true);

    story.update(5200, 5);
    expect(milestone.textContent).toBe('3.000 m');
    expect(story.queue).toHaveLength(1);

    story.update(5400, 5);
    expect(story.queue).toHaveLength(0);
    expect(milestone.textContent).toBe('5.000 m');
  });

  it('resets shown beats on a new run', () => {
    story.update(1000, 5);
    story.reset();
    expect(story.shown.size).toBe(0);
    expect(toast.classList.contains('hidden')).toBe(true);
    story.update(1000, 0);
    expect(toast.classList.contains('visible')).toBe(true);
  });
});
