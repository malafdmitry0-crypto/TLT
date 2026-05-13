import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';

type HelpedControlProps = {
  hint: string;
  children: ReactElement;
};

export default function HelpedControl({
  hint,
  children,
  ...controlProps
}: HelpedControlProps & Record<string, unknown>) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const child = Children.only(children) as ReactNode;

  useEffect(() => {
    const root = rootRef.current;
    const trimmedHint = hint.trim();
    if (!root || !trimmedHint) return undefined;

    const formItem = root.closest('.ant-form-item');
    const label = formItem?.querySelector('.ant-form-item-label > label') as HTMLElement | null;
    if (!label) return undefined;

    label.dataset.fieldHelp = trimmedHint;

    return () => {
      if (label.dataset.fieldHelp === trimmedHint) {
        delete label.dataset.fieldHelp;
      }
    };
  }, [hint]);

  return (
    <span ref={rootRef} className="field-control-with-help">
      {isValidElement(child) ? cloneElement(child, controlProps) : child}
    </span>
  );
}
