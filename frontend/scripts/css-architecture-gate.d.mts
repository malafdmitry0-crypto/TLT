/** Types for the fail-closed CSS architecture gate (AF100-03). */

export type CssRatchetGroup = {
  id: string;
  dir: string;
  match: RegExp;
  min: number;
};

export type CssRatchetMiss = {
  id: string;
  found: number;
  min: number;
  reason: string;
};

export declare const GROUPS: CssRatchetGroup[];

export declare function resolveTargets(
  root?: string,
  groups?: CssRatchetGroup[],
): { targets: string[]; missing: CssRatchetMiss[] };
