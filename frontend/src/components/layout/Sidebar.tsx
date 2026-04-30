import { Badge, Menu } from 'antd';
import {
  FireOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  FolderOutlined,
  QuestionCircleOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routes/routes';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useQuery } from '@tanstack/react-query';
import { listObjects } from '@/api/projects';
import { listElectricalCalcs } from '@/api/calculations';
import { isElectricalCalcSuccess } from '@/utils/calcStatus';

function StepLabel({
  text,
  count,
  color,
  done,
}: {
  text: string;
  count?: number;
  color?: string;
  done?: boolean;
}) {
  if (!count && !done) return <>{text}</>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      {text}
      {done && <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />}
      {count ? <Badge count={count} color={color ?? '#52c41a'} size="small" /> : null}
    </span>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((s) => s.role);
  const project = useProjectStore((s) => s.currentProject);

  const helpRoute = role === 'employee' ? '/help/employee' : '/help/guest';

  const { data: objects = [] } = useQuery({
    queryKey: ['project', project?.id, 'objects'],
    queryFn: () => listObjects(project!.id),
    enabled: !!project,
    staleTime: 30_000,
  });

  const { data: elecCalcs = [] } = useQuery({
    queryKey: ['project', project?.id, 'electrical-calcs'],
    queryFn: () => listElectricalCalcs(project!.id),
    enabled: !!project,
    staleTime: 30_000,
  });

  const validObjectCount = objects.filter((o) => o.is_valid).length;
  const successCalcIds = new Set(
    elecCalcs.filter(isElectricalCalcSuccess).map((c) => String(c.object_id))
  );
  const elecCalcCount = objects.filter((o) => successCalcIds.has(o.id)).length;
  const heatDone = validObjectCount > 0;
  const elecDone = validObjectCount > 0 && elecCalcCount === validObjectCount;

  const items = [
    {
      key: ROUTES.heatCalc,
      label: (
        <StepLabel
          text="Расчёт тепловых потерь"
          count={validObjectCount || undefined}
          color="#52c41a"
          done={heatDone}
        />
      ),
      icon: <FireOutlined />,
    },
    {
      key: ROUTES.elecCalc,
      label: (
        <StepLabel
          text="Электротехнический расчёт"
          count={elecCalcCount || undefined}
          color="#1890ff"
          done={elecDone}
        />
      ),
      icon: <ThunderboltOutlined />,
    },
    {
      key: ROUTES.specification,
      label: 'Спецификация',
      icon: <UnorderedListOutlined />,
    },
    { type: 'divider' as const },
    {
      key: ROUTES.report,
      label: 'Отчёт',
      icon: <FileTextOutlined />,
    },
    ...(role === 'employee'
      ? [
          { type: 'divider' as const },
          {
            key: ROUTES.projects,
            label: 'Проекты',
            icon: <FolderOutlined />,
          },
        ]
      : []),
    { type: 'divider' as const },
    {
      key: helpRoute,
      label: 'Инструкция',
      icon: <QuestionCircleOutlined />,
    },
  ];

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={(e) => navigate(e.key)}
      style={{ background: 'transparent', border: 0, minWidth: 0, flex: 1 }}
    />
  );
}
