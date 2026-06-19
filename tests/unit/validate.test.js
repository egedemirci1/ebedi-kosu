import { describe, it, expect } from 'vitest';
import { sanitizePlayerName, validateDistance } from '../../server/validate.js';

describe('sanitizePlayerName', () => {
  it('accepts valid names', () => {
    expect(sanitizePlayerName('Ali')).toBe('Ali');
    expect(sanitizePlayerName('  Player_1  ')).toBe('Player_1');
    expect(sanitizePlayerName('Ömer-42')).toBe('Ömer-42');
  });

  it('rejects too short or too long names', () => {
    expect(sanitizePlayerName('A')).toBeNull();
    expect(sanitizePlayerName('a'.repeat(21))).toBeNull();
  });

  it('rejects invalid characters', () => {
    expect(sanitizePlayerName('bad<script>')).toBeNull();
    expect(sanitizePlayerName('name@mail')).toBeNull();
  });
});

describe('validateDistance', () => {
  it('accepts valid distances', () => {
    expect(validateDistance(42)).toBe(42);
    expect(validateDistance(42.9)).toBe(42);
  });

  it('rejects invalid distances', () => {
    expect(validateDistance(0)).toBeNull();
    expect(validateDistance(-5)).toBeNull();
    expect(validateDistance('abc')).toBeNull();
    expect(validateDistance(1_000_000)).toBeNull();
  });
});
