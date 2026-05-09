import { Badge, Menu } from 'antd';
import {
  FireOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  FolderOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routes/routes';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import { useQuery } from '@tanstack/react-query';
import { getObjectsSummary } from '@/api/projects';

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

  const { data: summary } = useQuery({
    queryKey: ['project', project?.id, 'objects', 'summary'],
    queryFn: () => getObjectsSummary(project!.id),
    enabled: !!project,
    staleTime: 30_000,
  });

  const validObjectCount = summary?.valid ?? 0;
  const elecCalcCount = summary?.objects_with_successful_electrical_calculation ?? 0;
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
