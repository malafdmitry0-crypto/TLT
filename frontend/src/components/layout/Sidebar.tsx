import { Badge, Menu } from 'antd';
import {
  FireOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/routes/routes';
import { useProjectStore } from '@/store/projectStore';
import { useQuery } from '@tanstack/react-query';
import { getObjectsSummary } from '@/api/projects';
import { useLegacyElectricalVariantContext } from '@/hooks/useLegacyElectricalVariantContext';
import {
  buildElectricalVariantRoute,
  isSidebarElectricalVariantRouteOwner,
} from '@/domain/electricalVariantRouteModel';
import './layout-chrome.css';

function StepLabel({
  text,
  count,
  badgeColor = 'success',
  done,
}: {
  text: string;
  count?: number;
  /** Ant Badge preset tone — no raw hex (visual literal ratchet). */
  badgeColor?: 'success' | 'processing';
  done?: boolean;
}) {
  if (!count && !done) return <span className="heatcalc-step-label">{text}</span>;
  // У Badge с count цвет задаётся именем пресета: 'success'/'processing' — это
  // значения `status`, а не `color`, и antd молча рисует счётчик красным.
  const countColor = badgeColor === 'processing' ? 'blue' : 'green';
  return (
    <span className="heatcalc-step-label">
      {text}
      {done && <CheckCircleFilled className="heatcalc-step-done" />}
      {count ? <Badge count={count} color={countColor} size="small" /> : null}
    </span>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const project = useProjectStore((s) => s.currentProject);
  const variantContext = useLegacyElectricalVariantContext(project?.id, {
    syncRouteSelection: isSidebarElectricalVariantRouteOwner(location.pathname),
  });
  const selectedElectricalVariantId = variantContext.selectedVariant?.id ?? null;

  const { data: summary } = useQuery({
    queryKey: [
      'project',
      project?.id,
      'objects',
      'summary',
      selectedElectricalVariantId ?? 'no-electrical-variant',
    ],
    queryFn: () => getObjectsSummary(
      project!.id,
      selectedElectricalVariantId ?? undefined,
    ),
    enabled: !!project && !variantContext.isLoading && !variantContext.isError,
    staleTime: 30_000,
  });

  const validObjectCount = summary?.valid ?? 0;
  const elecCalcCount = selectedElectricalVariantId
    ? summary?.objects_with_successful_electrical_calculation ?? 0
    : 0;
  const heatDone = validObjectCount > 0;
  const elecDone = validObjectCount > 0 && elecCalcCount === validObjectCount;

  const items = [
    {
      key: ROUTES.heatCalc,
      label: (
        <StepLabel
          text="Расчёт тепловых потерь"
          count={validObjectCount || undefined}
          badgeColor="success"
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
          badgeColor="processing"
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
  ];

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[location.pathname]}
      items={items}
      onClick={(e) => navigate(buildElectricalVariantRoute(e.key, selectedElectricalVariantId))}
      className="sidebar-menu"
    />
  );
}
