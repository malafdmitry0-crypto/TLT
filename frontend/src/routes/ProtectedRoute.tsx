import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '@/constants/roles';
import { useAuthStore } from '@/store/authStore';

interface Props {
  allow: Role[];
  children: ReactNode;
}

export default function ProtectedRoute({ allow, children }: Props) {
  const role = useAuthStore((s) => s.role);
  if (!role) {
    return <Navigate to="/" replace />;
  }
  if (!allow.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
