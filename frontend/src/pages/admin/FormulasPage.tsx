import { Tabs } from 'antd';
import { TltCard } from '@/components/ui-kit';
import { FormulasPipeTab } from '@/pages/admin/formulasPipeTab';
import { FormulasTankTab } from '@/pages/admin/formulasTankTab';
import { FormulasElecTab } from '@/pages/admin/formulasElecTab';
import { FormulasTTTab } from '@/pages/admin/formulasTTTab';
import { FormulasResistiveTab } from '@/pages/admin/formulasResistiveTab';
import { FormulasTankCableTab } from '@/pages/admin/formulasTankCableTab';

export default function FormulasPage() {
  return (
    <TltCard title="Расчётные формулы">
      <Tabs
        items={[
          { key: 'pipe', label: 'Трубопровод', children: <FormulasPipeTab /> },
          { key: 'tank', label: 'Резервуар', children: <FormulasTankTab /> },
          { key: 'electrical', label: 'Саморег. ТЛТ', children: <FormulasElecTab /> },
          { key: 'tt', label: 'Саморег. ТТ', children: <FormulasTTTab /> },
          { key: 'resistive', label: 'Резистивный', children: <FormulasResistiveTab /> },
          { key: 'tank-cable', label: 'Укладка на резервуар', children: <FormulasTankCableTab /> },
        ]}
      />
    </TltCard>
  );
}
