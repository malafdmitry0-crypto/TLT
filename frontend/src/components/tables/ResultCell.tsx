import { Tooltip, Typography } from 'antd';
import { MinusCircleFilled, WarningFilled } from '@ant-design/icons';
import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

interface Props {
  value: string;
  obj: ProjectObject;
}

export default function ResultCell({ value, obj }: Props) {
  if (!obj.results) {
    const isUnsupported = obj.validation_errors?.category === 'unsupported';
    const errText =
      (obj.validation_errors?.message as string | undefined) ??
      'Расчёт не выполнен — проверьте параметры объекта';
    const short = errText.length > 32 ? errText.slice(0, 30) + '…' : errText;
    return (
      <Tooltip title={errText}>
        <span
          style={{
            color: isUnsupported ? '#8c8c8c' : '#d9363e',
            whiteSpace: 'nowrap',
          }}
        >
          {isUnsupported ? (
            <MinusCircleFilled style={{ marginRight: 4 }} />
          ) : (
            <WarningFilled style={{ marginRight: 4 }} />
          )}
          <Text type={isUnsupported ? 'secondary' : 'danger'} style={{ fontSize: 11 }}>
            {short}
          </Text>
        </span>
      </Tooltip>
    );
  }
  return <>{value}</>;
}
