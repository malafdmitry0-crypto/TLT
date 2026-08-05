/**
 * Характеризация «как есть» — слайс 1 переверстки.
 * Панель выбора кабеля: эталон горизонтальной строки [подпись | контрол]
 * и единственное место, где единица показана суффиксом внутри поля.
 * См. docs/tnp/cases/heat-frontend-restyle-prompt.md §3.4.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Form } from 'antd';
import CableAlgorithmPanel from './CableAlgorithmPanel';
import { WizardStoryShell } from './__fixtures__/wizardStoryDecorators';
import { expectIslandScale } from './__fixtures__/wizardIslandScale';

const meta = {
  title: 'Wizard/CableAlgorithmPanel',
  component: CableAlgorithmPanel,
  parameters: { layout: 'padded' },
  render: (args) => (
    <WizardStoryShell>
      <Form
        layout="vertical"
        requiredMark={false}
        initialValues={{
          safety_factor: 1.1,
          environment: 'normal',
          temperature_group: 'T1',
          min_switch_temperature: -35,
        }}
      >
        <CableAlgorithmPanel {...args} />
      </Form>
    </WizardStoryShell>
  ),
  args: { objectType: 'pipe' },
} satisfies Meta<typeof CableAlgorithmPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Труба: восемь полей ТНП + подсказка про шаг электрорасчёта. */
export const Pipe: Story = {
  play: async ({ canvas, canvasElement }) => {
    // заголовок панели — порядок баннеров проверяет layout-defaults
    await expect(canvas.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();


    // подпись «Марка кабеля… на шаге ЭР» снята решением владельца
    await expect(canvasElement.querySelector('.cable-algorithm-hint')).toBeNull();

    // горизонтальная строка: адаптер ant-form включён
    const grid = canvasElement.querySelector('.tlt-compact-field-grid');
    await expect(grid).toHaveClass('tlt-compact-field-grid--ant-form');
    await expect(grid).not.toHaveClass('tlt-compact-field-grid--labels-top');

    // ФИКСАЦИЯ ДЕФЕКТА «как есть»: FieldLabel режет подпись из 2+ слов на
    // отдельные <span> БЕЗ пробела между ними, поэтому textContent склеен
    // («Температурапропарки»). Доступное имя подписи получается слитным.
    // Проверка намеренно закрепляет текущее поведение — если при переверстке
    // пробел появится, история упадёт и решение будет принято осознанно.
    const labels = [...canvasElement.querySelectorAll('.ant-form-item-label')]
      .map((el) => el.textContent?.trim());
    await expect(labels).toContain('Рабочеенапряжение');
    await expect(labels).toContain('Температурапропарки');

    // §5.4: масштаб этого острова, а не зоны
    await expectIslandScale(
      canvasElement.querySelector('.object-wizard-cable-panel'),
      '.ant-input-number',
      { height: 36, radius: '6px', labelSize: '9px' },
    );
  },
};

/** Резервуар: состав полей тот же, отличается только тип объекта. */
export const Tank: Story = {
  args: { objectType: 'tank' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Алгоритм выбора кабеля')).toBeInTheDocument();
  },
};
