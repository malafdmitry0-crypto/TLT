import type { ReactNode } from 'react';
import { Tooltip } from 'antd';
import './common-chrome.css';

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
      className={`validation-highlight${isInvalid ? ' cell-invalid' : ''}`}
    >
      {children}
    </div>
  );
  if (isInvalid && errorText) {
    return <Tooltip title={errorText}>{content}</Tooltip>;
  }
  return content;
}
