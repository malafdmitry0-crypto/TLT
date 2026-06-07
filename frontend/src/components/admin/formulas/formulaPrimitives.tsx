import { Fragment, type ReactNode } from 'react';

// ─── Цвета переменных ────────────────────────────────────────────────────────
export const C = {
  result:  '#1677ff',   // Q, P, I — синий
  temp:    '#c0392b',   // ΔT, температуры — красный
  geom:    '#2c3e50',   // d, L, S — тёмный
  resist:  '#7d3c98',   // R — фиолетовый
  coeff:   '#1a7a4a',   // K, α, λ — зелёный
  unit:    '#888',      // [Вт] — серый
  label:   '#555',
} as const;

// ─── Базовые примитивы ────────────────────────────────────────────────────────

/** Дробь: числитель над знаменателем */
export function Frac({ top, bot }: { top: ReactNode; bot: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', verticalAlign: 'middle', margin: '0 3px', lineHeight: 1.25 }}>
      <span style={{ borderBottom: '1.5px solid #333', padding: '0 4px 2px', whiteSpace: 'nowrap', textAlign: 'center' }}>{top}</span>
      <span style={{ padding: '2px 4px 0', whiteSpace: 'nowrap', textAlign: 'center' }}>{bot}</span>
    </span>
  );
}

/** Цветная переменная */
export function V({ c, children, bold }: { c: string; children: ReactNode; bold?: boolean }) {
  return <span style={{ color: c, fontWeight: bold ? 700 : 500 }}>{children}</span>;
}

/** Нижний индекс */
export function S({ children }: { children: ReactNode }) {
  return <sub style={{ fontSize: '0.72em', lineHeight: 0 }}>{children}</sub>;
}

/** Верхний индекс */
export function Sup({ children }: { children: ReactNode }) {
  return <sup style={{ fontSize: '0.7em', lineHeight: 0 }}>{children}</sup>;
}

/** Строка формулы — flex-row с вертикальным центрированием */
export function FL({ children, indent }: { children: ReactNode; indent?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2,
      fontSize: 15.5, lineHeight: 2.4,
      marginLeft: indent ? 24 : 0,
    }}>
      {children}
    </div>
  );
}

/** Блок с формулой — рамка с отступом */
export function FormulaBox({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <div style={{
      background: '#fafafa',
      border: '1px solid #e8e8e8',
      borderLeft: `4px solid ${accent ?? '#1677ff'}`,
      borderRadius: '0 8px 8px 0',
      padding: '14px 20px',
      marginBottom: 12,
      overflowX: 'auto',
    }}>
      {children}
    </div>
  );
}

/** Заголовок вспомогательной формулы */
export function SubTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0, margin: '14px 0 4px' }}>
      {children}
    </div>
  );
}

/** Таблица переменных */
export function VarLegend({ rows }: { rows: { sym: ReactNode; color?: string; desc: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12.5, marginTop: 10 }}>
      {rows.map(({ sym, color, desc }, i) => (
        <Fragment key={i}>
          <span key={`s${i}`} style={{ color: color ?? C.label, fontWeight: 600, whiteSpace: 'nowrap' }}>{sym}</span>
          <span key={`d${i}`} style={{ color: C.label }}>{desc}</span>
        </Fragment>
      ))}
    </div>
  );
}
