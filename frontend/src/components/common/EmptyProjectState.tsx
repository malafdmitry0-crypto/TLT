import { Alert, Button, Card, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routes/routes';
import type { ReactNode } from 'react';

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
    <Card>
      <Title level={4}>
        {icon}
        {title}
      </Title>
      <Paragraph type="secondary">{description}</Paragraph>
      <Alert
        type="info"
        showIcon
        message="Проект не выбран"
        description="Создайте новый проект или откройте существующий, чтобы начать работу."
        action={
          <Button type="primary" size="small" onClick={() => navigate(ROUTES.projects)}>
            Открыть проект
          </Button>
        }
      />
    </Card>
  );
}
