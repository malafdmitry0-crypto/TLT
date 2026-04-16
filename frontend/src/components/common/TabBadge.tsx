import type { ReactNode } from 'react';

interface TabBadgeProps {
  label: ReactNode;
  count: number;
}

/**
 * Заголовок вкладки с маленьким синим счётчиком справа.
 * Используется в табах HeatCalcPage (Трубопроводы / Резервуары).
 * Счётчик скрыт, если count === 0.
 */
export default function TabBadge({ label, count }: TabBadgeProps) {
  return (
    <span>
      {label}
      {count > 0 && (
        <span
          style={{
            marginLeft: 6,
            padding: '0 6px',
            borderRadius: 10,
            fontSize: 11,
            background: '#1890ff',
            color: '#fff',
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}
