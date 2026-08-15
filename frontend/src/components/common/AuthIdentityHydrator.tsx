/** Restores the registered user's identity after a full page reload. */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';

export default function AuthIdentityHydrator() {
  const role = useAuthStore((state) => state.role);
  const user = useAuthStore((state) => state.user);
  const restoreEmployeeIdentity = useAuthStore((state) => state.restoreEmployeeIdentity);
  const needsIdentity = (role === 'employee' || role === 'admin') && user == null;

  const { data } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: needsIdentity,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (data && needsIdentity) restoreEmployeeIdentity(data);
  }, [data, needsIdentity, restoreEmployeeIdentity]);

  return null;
}
