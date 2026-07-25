import { FireOutlined } from '@ant-design/icons';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import './heatcalc-workspace-shell.css';

export default function HeatCalcEmptyProjectState() {
  return (
    <EmptyProjectState
      icon={<FireOutlined className="heatcalc-empty-icon" />}
      title="Расчёт теплопотерь"
      description="Шаг 1 из 4. Добавьте объекты (трубопроводы, резервуары) вручную или импортом из Excel / CSV — система автоматически рассчитает тепловые потери."
    />
  );
}
