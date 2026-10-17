import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/** emits sw.js (from sw/sw.js) listing every built file, so the game loads offline after the first visit */
function offline(): Plugin {
  return {
    name: 'thaw-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'sw.js').sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('sw/sw.js', 'utf8')
        .replace('__FILES__', JSON.stringify(files.map((f) => './' + f)))
        .replace('__VERSION__', JSON.stringify(version));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// relative base: the same dist works on GitHub Pages (/thaw/) and in the itch.io zip
export default defineConfig({ base: './', plugins: [offline()] });
