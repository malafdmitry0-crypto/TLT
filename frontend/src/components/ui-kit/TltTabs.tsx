/**
 * TltTabs — Ant Tabs under stable TLT public item shape.
 */
import {
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Tabs } from 'antd';

function joinClassNames(...classNames: Array<string | false | undefined>) {
  return classNames.filter(Boolean).join(' ') || undefined;
}

export interface TltTabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TltTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onChange'> {
  items: TltTabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  tabListLabel?: string;
}

function resolveTabValue(items: TltTabItem[], requested?: string) {
  const requestedItem = requested ? items.find((item) => item.id === requested) : undefined;
  if (requestedItem && !requestedItem.disabled) return requestedItem.id;
  return items.find((item) => !item.disabled)?.id;
}

export function TltTabs({
  className,
  defaultValue,
  id,
  items,
  onChange,
  tabListLabel = 'Вкладки',
  value,
  ...rest
}: TltTabsProps) {
  if (items.length === 0) return null;
  const active = resolveTabValue(items, value ?? defaultValue);

  return (
    <div
      {...rest}
      id={id}
      className={joinClassNames('tlt-ui-tabs', className)}
      aria-label={tabListLabel}
    >
      <Tabs
        activeKey={value !== undefined ? active : undefined}
        defaultActiveKey={value === undefined ? active : undefined}
        onChange={(key) => onChange?.(key)}
        items={items.map((item) => ({
          key: item.id,
          label: item.label,
          children: item.content,
          disabled: item.disabled,
        }))}
      />
    </div>
  );
}
