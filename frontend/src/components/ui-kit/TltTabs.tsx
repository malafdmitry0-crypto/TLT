/**
 * TltTabs primitive — owner-local extract from UiPrimitives.
 */
import {
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';

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

function nextEnabledTab(items: TltTabItem[], currentIndex: number, direction: 1 | -1) {
  if (items.length === 0) return undefined;
  for (let step = 1; step <= items.length; step += 1) {
    const index = (currentIndex + direction * step + items.length) % items.length;
    if (!items[index].disabled) return items[index].id;
  }
  return undefined;
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
  const generatedId = useId().replace(/:/g, '');
  const baseId = id ?? `tlt-tabs-${generatedId}`;
  const [uncontrolledValue, setUncontrolledValue] = useState(() => resolveTabValue(items, defaultValue));
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeValue = resolveTabValue(items, value ?? uncontrolledValue);
  const activeItem = items.find((item) => item.id === activeValue);

  if (items.length === 0) return null;

  const selectTab = (nextValue: string | undefined) => {
    if (!nextValue) return;
    if (value === undefined) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextValue: string | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextValue = nextEnabledTab(items, index, 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextValue = nextEnabledTab(items, index, -1);
    } else if (event.key === 'Home') {
      nextValue = resolveTabValue(items);
    } else if (event.key === 'End') {
      nextValue = [...items].reverse().find((item) => !item.disabled)?.id;
    }
    if (!nextValue) return;
    event.preventDefault();
    selectTab(nextValue);
    buttonRefs.current[nextValue]?.focus();
  };

  return (
    <div {...rest} className={joinClassNames('tlt-ui-tabs', className)} id={id}>
      <div className="tlt-ui-tabs__list" role="tablist" aria-label={tabListLabel}>
        {items.map((item, index) => {
          const isActive = item.id === activeValue;
          const tabId = `${baseId}-tab-${item.id}`;
          const panelId = `${baseId}-panel-${item.id}`;
          return (
            <button
              key={item.id}
              ref={(element) => { buttonRefs.current[item.id] = element; }}
              className="tlt-ui-tabs__tab"
              type="button"
              role="tab"
              id={tabId}
              aria-controls={panelId}
              aria-selected={isActive}
              disabled={item.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(item.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {activeItem ? (
        <div
          className="tlt-ui-tabs__panel"
          role="tabpanel"
          id={`${baseId}-panel-${activeItem.id}`}
          aria-labelledby={`${baseId}-tab-${activeItem.id}`}
          tabIndex={0}
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}

