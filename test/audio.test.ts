import { describe, expect, it } from 'vitest';
import { ambient, cue, start } from '../src/audio';

describe('sound', () => {
  it('is silent and harmless where there is no Web Audio (tests, before the first click)', () => {
    expect(() => {
      cue('click');
      ambient({ wind: true, motor: true });
      start();
      for (const c of ['key', 'mount', 'snap', 'motor', 'cam', 'beep', 'nonsense']) cue(c);
    }).not.toThrow();
  });
});
