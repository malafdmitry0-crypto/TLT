import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';

type HelpedControlProps = {
  hint: string;
  children: ReactElement;
};

function HelpIcon({ text }: { text: string }) {
  return (
    <Tooltip title={text}>
      <InfoCircleOutlined style={{ color: '#8c8c8c', cursor: 'help', flexShrink: 0 }} />
    </Tooltip>
  );
}

export default function HelpedControl({
  hint,
  children,
  ...controlProps
}: HelpedControlProps & Record<string, unknown>) {
  const child = Children.only(children) as ReactNode;

  return (
    <span className="field-control-with-help">
      {isValidElement(child) ? cloneElement(child, controlProps) : child}
      <HelpIcon text={hint} />
    </span>
  );
}
