import { Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routes/routes';
import type { ReactNode } from 'react';
import { TltAlert, TltButton, TltCard } from '@/components/ui-kit';

const { Title, Paragraph } = Typography;

interface EmptyProjectStateProps {
  icon: ReactNode;
  title: string;
  description: string;
}

/**
 * Состояние «Проект не выбран» — показывается на страницах воркспейса, когда
 * в projectStore нет currentProject. Ранее дублировалось в 4 страницах
 * (HeatCalcPage, ElecCalcPage, SpecificationPage, ReportPage).
 */
export default function EmptyProjectState({
  icon,
  title,
  description,
}: EmptyProjectStateProps) {
  const navigate = useNavigate();
  return (
    <TltCard>
      <Title level={4}>
        {icon}
        {title}
      </Title>
      <Paragraph type="secondary">{description}</Paragraph>
      <TltAlert
        tone="info"
        title="Проект не выбран"
        action={
          <TltButton variant="primary" size="compact" onClick={() => navigate(ROUTES.projects)}>
            Открыть проект
          </TltButton>
        }
      >
        Создайте новый проект или откройте существующий, чтобы начать работу.
      </TltAlert>
    </TltCard>
  );
}
