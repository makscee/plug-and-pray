import { describe, expect, it } from 'vitest';
import '../src/mods';
import { MODS } from '../src/core/mods';
import { card, CARD_TEXT, short } from '../src/ui/cardText';

describe('v3 item cards', () => {
  it('every module has hand-written card text: a mechanic and a good-for line', () => {
    const missing = Object.keys(MODS).filter((id) => !CARD_TEXT[id]);
    expect(missing).toEqual([]);
    for (const id of Object.keys(MODS)) {
      const c = card({ mod: id });
      expect(c.does.length, id).toBeGreaterThan(5);
      expect(c.good.length, id).toBeGreaterThan(3);
      expect(c.cost, id).toMatch(/⚡︎/);
      expect(c.nums.length, id).toBeLessThanOrEqual(2);
      // the noise stays off the face of the card
      expect(c.does + c.nums.join(), id).not.toMatch(/\bpx\b|\bfps\b|shades/);
    }
  });
  it('weapons show dmg/s and reach, eyes sight range and colour', () => {
    expect(card({ mod: 'nail-psalm' }).nums).toEqual(['1.7 dmg/s', 'reach 8, aimed']);
    expect(card({ mod: 'pinhole-eye' }).nums).toEqual(['sees 6 cells', 'grey']);
    expect(short({ mod: 'choir-bell' })).toMatch(/^hits everything within 2 cells at once/);
  });
  it('a level shows as a roman numeral, nothing when absent', () => {
    expect(card({ mod: 'halo' }).level).toBe('');
    expect(card({ mod: 'halo', level: 2 } as never).level).toBe('II');
  });
});
