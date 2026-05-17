import { Tooltip, Typography } from 'antd';
import { WarningFilled } from '@ant-design/icons';
import type { ProjectObject } from '@/types/project';

const { Text } = Typography;

interface Props {
  value: string;
  obj: ProjectObject;
}

export default function ResultCell({ value, obj }: Props) {
  if (!obj.results) {
    const errText =
      (obj.validation_errors?.message as string | undefined) ??
      (obj.validation_errors?.error as string | undefined) ??
      'Расчёт не выполнен — проверьте параметры объекта';
    const short = errText.length > 32 ? errText.slice(0, 30) + '…' : errText;
    return (
      <Tooltip title={errText}>
        <span style={{ color: '#d9363e', whiteSpace: 'nowrap' }}>
          <WarningFilled style={{ marginRight: 4 }} />
          <Text type="danger" style={{ fontSize: 11 }}>{short}</Text>
        </span>
      </Tooltip>
    );
  }
  return <>{value}</>;
}
