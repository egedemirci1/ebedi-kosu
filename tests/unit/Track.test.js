import { describe, it, expect, beforeEach } from 'vitest';
import { Track } from '../../src/Track.js';
import { GapManager } from '../../src/GapManager.js';
import { createScene, insertGap } from '../helpers/fixtures.js';

function findTileByWorldZ(track, worldZ) {
  for (const seg of track.segments) {
    for (const tile of seg.trackTiles) {
      const z = seg.z + tile.localZ;
      if (Math.abs(z - worldZ) < 0.01) {
        return { seg, tile, worldZ: z };
      }
    }
  }
  return null;
}

function allMeshesVisible(tile) {
  return tile.meshes.every((mesh) => mesh.visible);
}

describe('Track', () => {
  let scene;
  let track;
  let gaps;

  beforeEach(() => {
    scene = createScene();
    track = new Track(scene);
    gaps = new GapManager(scene);
  });

  describe('updateGapMask', () => {
    it('no-ops safely when gap manager is missing', () => {
      const before = track.segments[0].trackTiles[0].meshes[0].visible;
      track.updateGapMask(null);
      expect(track.segments[0].trackTiles[0].meshes[0].visible).toBe(before);
    });

    it('hides every mesh on tiles whose center lies inside a gap', () => {
      const target = findTileByWorldZ(track, -9);
      expect(target).not.toBeNull();

      insertGap(gaps, target.worldZ, 2);
      track.updateGapMask(gaps);

      expect(allMeshesVisible(target.tile)).toBe(false);
    });

    it('hides tiles that overlap gap edges, not only centered tiles (wall/floor seam fix)', () => {
      const edgeTile = findTileByWorldZ(track, -7);
      expect(edgeTile).not.toBeNull();

      insertGap(gaps, -9, 2);
      track.updateGapMask(gaps);

      expect(allMeshesVisible(edgeTile.tile)).toBe(false);
    });

    it('keeps tile visible when gap does not overlap its span', () => {
      insertGap(gaps, -9, 2);
      const clearTile = findTileByWorldZ(track, -5);
      expect(clearTile).not.toBeNull();
      track.updateGapMask(gaps);
      expect(allMeshesVisible(clearTile.tile)).toBe(true);
    });

    it('does not hide tiles when gap is far from segment (margin-only overlap regression)', () => {
      const tile = findTileByWorldZ(track, -9);
      insertGap(gaps, -50, 3);
      track.updateGapMask(gaps);
      expect(allMeshesVisible(tile.tile)).toBe(true);
    });

    it('restores all tile visibility on reset after gap masking', () => {
      const tile = findTileByWorldZ(track, -9);
      insertGap(gaps, tile.worldZ, 2.8);
      track.updateGapMask(gaps);
      expect(allMeshesVisible(tile.tile)).toBe(false);

      track.reset();
      expect(allMeshesVisible(tile.tile)).toBe(true);
    });
  });

  describe('getRearZ', () => {
    it('returns furthest negative segment z excluding optional segment', () => {
      const seg = track.segments[0];
      const rear = track.getRearZ(seg);
      expect(rear).toBeLessThan(seg.z);
    });
  });

  describe('floor cliff edge snapping', () => {
    it('snaps back edge to last solid tile boundary before gap start', () => {
      // gap center -100, width 3 → start -101.5; last solid front edge at -102
      expect(track.getFloorEdgeBeforeGap(-101.5, -100)).toBe(-102);
    });

    it('snaps front edge to first solid tile boundary after gap end', () => {
      expect(track.getFloorEdgeAfterGap(-98.5, -100)).toBe(-98);
    });
  });
});
