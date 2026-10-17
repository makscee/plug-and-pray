// A family's window body: `view(family, make)`. make(el, inst, game) returns an updater called
// every frame while the window is open. A family without a view shows its flavour and status text.

import type { Family } from '../core/mods';
import type { Game, Inst } from '../core/types';

export interface View {
  update(g: Game, dt: number): void;
  dispose?(): void;
}
export type MakeView = (el: HTMLElement, inst: Inst, g: Game) => View;

export const VIEWS: Partial<Record<Family, MakeView>> = {};
export function view(fam: Family, make: MakeView): void {
  VIEWS[fam] = make;
}
