/** Restores the server-authoritative identity and guest project after a reload. */
import { useEffect, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getCurrentGuestSession, getMe } from '@/api/auth';
import PageSkeleton from '@/components/common/PageSkeleton';
import { useAuthStore } from '@/store/authStore';
import { useProjectStore } from '@/store/projectStore';

export default function AuthIdentityHydrator({ children }: { children?: ReactNode }) {
  const role = useAuthStore((state) => state.role);
  const user = useAuthStore((state) => state.user);
  const setGuest = useAuthStore((state) => state.setGuest);
  const logout = useAuthStore((state) => state.logout);
  const restoreEmployeeIdentity = useAuthStore((state) => state.restoreEmployeeIdentity);
  const currentProject = useProjectStore((state) => state.currentProject);
  const setCurrentProject = useProjectStore((state) => state.setCurrentProject);
  const needsIdentity = (role === 'employee' || role === 'admin') && user == null;

  const { data: employee } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: needsIdentity,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const guestProbe = useQuery({
    // Role is part of the key: entering as guest must not reuse the anonymous
    // startup probe (`null`) and immediately log the freshly created guest out.
    queryKey: ['auth', 'guest', 'current', role],
    queryFn: getCurrentGuestSession,
    enabled: role === null || role === 'guest',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (employee && needsIdentity) restoreEmployeeIdentity(employee);
  }, [employee, needsIdentity, restoreEmployeeIdentity]);

  useEffect(() => {
    if (!guestProbe.isSuccess) return;
    if (guestProbe.data) {
      setGuest(guestProbe.data.session_id);
      setCurrentProject(guestProbe.data.project);
    } else if (role === 'guest') {
      logout();
      setCurrentProject(null);
    }
  }, [guestProbe.data, guestProbe.isSuccess, logout, role, setCurrentProject, setGuest]);

  const guestSnapshotApplied = guestProbe.data
    ? role === 'guest' && currentProject?.id === guestProbe.data.project.id
    : role === null;
  if (
    (role === null || role === 'guest')
    && (guestProbe.isPending || (guestProbe.isSuccess && !guestSnapshotApplied))
  ) {
    return <PageSkeleton />;
  }
  return <>{children}</>;
}
