import type { ReactNode } from 'react';
import './common-chrome.css';

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
        <span className="tab-badge">
          {count}
        </span>
      )}
    </span>
  );
}
