import { Fragment, type ReactNode } from 'react';

import '@/components/admin/formulas/formula-primitives.css';

// ─── Цвета переменных (JS palette for call sites; CSS owns presentation via role) ─
/** Palette keys for role lookup; presentation is owner CSS via --color-formula-* */
export const C = {
  result:  '#1677ff',   // --color-formula-result / swatch-1677ff
  temp:    '#9a3412',   // --color-formula-temp / swatch-9a3412
  geom:    '#34495e',   // --color-formula-geom / swatch-34495e
  resist:  '#7d3c98',   // --color-formula-resist / role-admin
  coeff:   '#1f6f3e',   // --color-formula-coeff / swatch-1f6f3e
  unit:    '#888888',   // --color-formula-unit / text-tertiary
  label:   '#555555',   // --color-formula-label / text-body-muted
  req:     '#fa8c16',   // --color-formula-req / formula-cable
} as const;

export type FormulaColorRole = keyof typeof C;

const ROLE_BY_COLOR: Record<string, FormulaColorRole> = {
  [C.result]: 'result',
  [C.temp]: 'temp',
  [C.geom]: 'geom',
  [C.resist]: 'resist',
  [C.coeff]: 'coeff',
  [C.unit]: 'unit',
  [C.label]: 'label',
  [C.req]: 'req',
};

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function colorRole(color: string | undefined, fallback: FormulaColorRole = 'label'): FormulaColorRole {
  if (!color) return fallback;
  return ROLE_BY_COLOR[color] ?? fallback;
}

// ─── Базовые примитивы ────────────────────────────────────────────────────────

/** Дробь: числитель над знаменателем */
export function Frac({ top, bot }: { top: ReactNode; bot: ReactNode }) {
  return (
    <span className="formula-frac">
      <span className="formula-frac__num">{top}</span>
      <span className="formula-frac__den">{bot}</span>
    </span>
  );
}

/** Цветная переменная — palette role class only (no runtime style) */
export function V({ c, children, bold }: { c: string; children: ReactNode; bold?: boolean }) {
  const role = colorRole(c, 'result');
  return (
    <span className={joinClassNames('formula-var', `formula-var--${role}`, bold && 'formula-var--bold')}>
      {children}
    </span>
  );
}

/** Нижний индекс */
export function S({ children }: { children: ReactNode }) {
  return <sub className="formula-sub">{children}</sub>;
}

/** Верхний индекс */
export function Sup({ children }: { children: ReactNode }) {
  return <sup className="formula-sup">{children}</sup>;
}

/** Строка формулы — flex-row с вертикальным центрированием */
export function FL({ children, indent }: { children: ReactNode; indent?: boolean }) {
  return (
    <div className={joinClassNames('formula-line', indent && 'formula-line--indent')}>
      {children}
    </div>
  );
}

/** Блок с формулой — accent maps to role border color (no runtime style) */
export function FormulaBox({ children, accent }: { children: ReactNode; accent?: string }) {
  const role = colorRole(accent, 'result');
  return (
    <div className={joinClassNames('formula-box', `formula-box--${role}`)}>
      {children}
    </div>
  );
}

/** Заголовок вспомогательной формулы */
export function SubTitle({ children }: { children: ReactNode }) {
  return (
    <div className="formula-subtitle">
      {children}
    </div>
  );
}

/** Таблица переменных */
export function VarLegend({ rows }: { rows: { sym: ReactNode; color?: string; desc: string }[] }) {
  return (
    <div className="formula-var-legend">
      {rows.map(({ sym, color, desc }, i) => {
        const role = colorRole(color, 'label');
        return (
          <Fragment key={i}>
            <span className={joinClassNames('formula-var-legend__sym', `formula-var-legend__sym--${role}`)}>
              {sym}
            </span>
            <span className="formula-var-legend__desc">{desc}</span>
          </Fragment>
        );
      })}
    </div>
  );
}
