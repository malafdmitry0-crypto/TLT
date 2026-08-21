import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RoleGuard from '@/components/common/RoleGuard';
import { useAuthStore } from '@/store/authStore';

describe('RoleGuard', () => {
  beforeEach(() => useAuthStore.getState().logout());

  it('renders children when role allowed', () => {
    useAuthStore.getState().setGuest('abc');
    render(
      <RoleGuard allow={['guest', 'employee']}>
        <span>OK</span>
      </RoleGuard>
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders fallback when role not allowed', () => {
    useAuthStore.getState().setGuest('abc');
    render(
      <RoleGuard allow={['admin']} fallback={<span>NO</span>}>
        <span>OK</span>
      </RoleGuard>
    );
    expect(screen.getByText('NO')).toBeInTheDocument();
  });

  it('renders nothing when no role', () => {
    const { container } = render(
      <RoleGuard allow={['guest']}>
        <span>OK</span>
      </RoleGuard>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
