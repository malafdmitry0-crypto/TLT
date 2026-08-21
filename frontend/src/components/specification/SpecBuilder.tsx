import { TltButton } from '@/components/ui-kit';

interface Props {
  onGenerate: () => void;
  loading?: boolean;
}

export default function SpecBuilder({ onGenerate, loading }: Props) {
  return (
    <TltButton variant="primary" onClick={onGenerate} loading={loading}>
      Сгенерировать спецификацию
    </TltButton>
  );
}
