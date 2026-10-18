import { describe, expect, it } from 'vitest';
import '../src/mods';
import '../src/fight';
import '../src/world/gimmicks';
import { ENEMIES } from '../src/core/game';
import { bestArm, danger, FOE_TEXT, foeText, why } from '../src/ui/foeText';

const arm = (name: string, o: Partial<{ damage: number; cooldown: number; range: number; sweep: boolean }> = {}) => ({ name, damage: 1, cooldown: 1, range: 1.8, sweep: false, ...o });

describe('v4 foes: foe text', () => {
  it('every foe kind has a line, a tip and a mark', () => {
    for (const type of Object.keys(ENEMIES)) {
      const t = foeText(type);
      expect(t.what.length, type).toBeGreaterThan(5);
      expect(t.tip.length, type).toBeGreaterThan(5);
    }
    // the common kinds have their own text, not the keeper's
    for (const type of ['mite', 'seraph', 'walker', 'hum', 'mimic', 'pyre', 'cantor']) expect(FOE_TEXT[type], type).toBeTruthy();
  });
  it('danger reads blows to stop you', () => {
    expect(danger(0.5, 10)).toBe('low');
    expect(danger(1.5, 10)).toBe('mid');
    expect(danger(4, 10)).toBe('high');
  });
  it('the best weapon follows what the foe wants', () => {
    const arms = [arm('spark finger'), arm('choir bell', { damage: 1.5, cooldown: 1.4, range: 2, sweep: true }), arm('bone lance', { damage: 6, cooldown: 1.8, range: 5 })];
    expect(bestArm(arms, 'sweep')?.name).toBe('choir bell');
    expect(bestArm(arms, 'big', 1.2)?.name).toBe('bone lance');
    expect(bestArm(arms, 'reach')?.name).toBe('bone lance');
    expect(bestArm([], 'any')).toBeNull();
    expect(why(arms[0], 'sweep')).toMatch(/choir bell/);
  });
});
