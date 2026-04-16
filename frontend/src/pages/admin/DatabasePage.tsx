import { Card, Tabs, Typography } from 'antd';

const { Paragraph } = Typography;

export default function DatabasePage() {
  return (
    <Card title="Внешняя база данных">
      <Tabs
        items={[
          {
            key: 'cables',
            label: 'Кабели',
            children: (
              <Paragraph>
                CRUD расширенных кабелей — добавить / обновить / удалить.
                Реализовано через <code>/api/v1/admin/cables</code>.
              </Paragraph>
            ),
          },
          {
            key: 'accessories',
            label: 'Аксессуары',
            children: (
              <Paragraph>
                CRUD аксессуаров — <code>/api/v1/admin/accessories</code>.
              </Paragraph>
            ),
          },
        ]}
      />
    </Card>
  );
}
