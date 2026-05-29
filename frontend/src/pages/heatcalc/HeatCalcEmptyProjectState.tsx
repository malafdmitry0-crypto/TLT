import { FireOutlined } from '@ant-design/icons';

import EmptyProjectState from '@/components/common/EmptyProjectState';

export default function HeatCalcEmptyProjectState() {
  return (
    <EmptyProjectState
      icon={<FireOutlined style={{ marginRight: 8, color: '#e06c1e' }} />}
      title="Расчёт теплопотерь"
      description="Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери."
    />
  );
}
