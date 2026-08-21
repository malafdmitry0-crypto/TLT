import type { ReactNode } from 'react';
import type { Role } from '@/constants/roles';
import { useAuthStore } from '@/store/authStore';

interface Props {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RoleGuard({ allow, children, fallback = null }: Props) {
  const role = useAuthStore((s) => s.role);
  if (role && allow.includes(role)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
