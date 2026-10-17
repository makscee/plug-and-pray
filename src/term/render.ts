// Lines to DOM. Tokens are spans that carry their Token; one click handler serves every window.

import type { Line, Token } from '../model';

export type TokenEl = HTMLElement & { tok?: Token };

let onClick: (t: Token) => void = () => {};

export function setClickHandler(fn: (t: Token) => void): void {
  onClick = fn;
}

export function tokenEl(t: Token): TokenEl {
  const el: TokenEl = document.createElement('span');
  el.className = `tok k-${t.kind}`;
  el.textContent = t.text;
  el.dataset.tok = t.text;
  if (t.nodeId) el.dataset.node = t.nodeId;
  el.tok = t;
  return el;
}

export function renderLine(line: Line): HTMLElement {
  const el = document.createElement('div');
  el.className = 'line';
  for (const seg of line) el.append(typeof seg === 'string' ? document.createTextNode(seg) : tokenEl(seg));
  if (!line.length) el.append(document.createTextNode(' '));
  return el;
}

document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('.tok') as TokenEl | null;
  if (el?.tok && !el.classList.contains('dim')) onClick(el.tok);
});
