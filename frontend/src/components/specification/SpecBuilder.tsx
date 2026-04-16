import { Button } from 'antd';

interface Props {
  onGenerate: () => void;
  loading?: boolean;
}

export default function SpecBuilder({ onGenerate, loading }: Props) {
  return (
    <Button type="primary" onClick={onGenerate} loading={loading}>
      Сгенерировать спецификацию
    </Button>
  );
}
