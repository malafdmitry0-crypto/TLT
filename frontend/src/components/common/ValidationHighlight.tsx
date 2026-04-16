import type { ReactNode } from 'react';
import { Tooltip } from 'antd';

interface Props {
  isInvalid?: boolean;
  errorText?: string;
  children: ReactNode;
}

export default function ValidationHighlight({
  isInvalid = false,
  errorText,
  children,
}: Props) {
  const content = (
    <div
      data-testid="validation-wrapper"
      className={isInvalid ? 'cell-invalid' : ''}
      style={{ padding: 2 }}
    >
      {children}
    </div>
  );
  if (isInvalid && errorText) {
    return <Tooltip title={errorText}>{content}</Tooltip>;
  }
  return content;
}
