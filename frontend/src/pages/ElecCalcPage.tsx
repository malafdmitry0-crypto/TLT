import { ThunderboltOutlined } from '@ant-design/icons';

import EmptyProjectState from '@/components/common/EmptyProjectState';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';
import ElecCalcProject from '@/pages/electrical/ElecCalcProject';
import '@/pages/electrical/elec-workspace.css';

export default function ElecCalcPage() {
  const project = useProjectStore((state) => state.currentProject);
  const role = useAuthStore((state) => state.role);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const sessionId = useAuthStore((state) => state.sessionId);

  if (!project) {
    return (
      <EmptyProjectState
        icon={<ThunderboltOutlined className="electrical-empty-icon" />}
        title="Электротехнический расчёт"
        description="Шаг 2 из 4. Результаты автоподбора греющего кабеля ТЛТ для каждого объекта."
      />
    );
  }

  const canMutate = role === 'admin'
    || (role === 'employee' && project.user_id === userId)
    || (role === 'guest' && project.session_id === sessionId);

  return <ElecCalcProject key={project.id} projectId={project.id} canMutate={canMutate} />;
}
