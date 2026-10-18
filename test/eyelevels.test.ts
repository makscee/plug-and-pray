// v5 (Maks 10-18 20:00): an eye's level changes its picture, not just its range
import { describe, expect, it } from 'vitest';
import { param } from '../src/core/mods';
import { baseLook, eyeLine, eyeTone } from '../src/sight/layers';
import { keyNums } from '../src/ui/cardText';

const eye = (mod: string, level: number) => ({ mod, level });

describe('eye levels', () => {
  it('scales res, colours, fps and range by level', () => {
    const at = (l: number) => ['res', 'colors', 'fps', 'range'].map((k) => param<number>(eye('pinhole-eye', l), k, 0));
    expect(at(1)).toEqual([48, 5, 12, 8]);
    const [r2, c2, f2, g2] = at(2), [r3, c3, f3, g3] = at(3);
    expect(r2).toBe(67);
    expect(r3).toBe(86);
    expect(c2).toBeGreaterThan(5);
    expect(c3).toBeGreaterThan(c2);
    expect(f3).toBeGreaterThan(f2);
    expect(f2).toBeGreaterThan(12);
    expect(g3).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(8);
  });
  it('a full-colour eye stays full colour; power stays', () => {
    expect(param<number>(eye('dawn-eye', 3), 'colors', 0)).toBe(0);
    expect(param<number>(eye('dawn-eye', 3), 'res', 0)).toBe(173);
  });
  it('a grey eye goes amber at II and colour at III', () => {
    expect(baseLook(eye('pinhole-eye', 1)).filter).toBe('gray');
    expect(baseLook(eye('pinhole-eye', 2)).filter).toBe('amber');
    expect(baseLook(eye('pinhole-eye', 3)).filter).toBe('color');
    expect(eyeTone(eye('carrion-eye', 2))).toBe('amber');
    expect(eyeLine(eye('pinhole-eye', 2))).toBe('pinhole eye II: sharper, amber');
  });
  it('the card shows the level\'s values', () => {
    expect(keyNums(eye('pinhole-eye', 1))).toEqual(['sees 8 cells', 'grey']);
    expect(keyNums(eye('pinhole-eye', 2))).toEqual(['sees 10.8 cells', 'amber']);
    expect(keyNums(eye('pinhole-eye', 3))[1]).toBe('colour');
    expect(keyNums(eye('dawn-eye', 2))[1]).toBe('sharp colour');
  });
});
