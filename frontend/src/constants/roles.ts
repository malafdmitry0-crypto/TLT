export type Role = 'guest' | 'employee' | 'admin';

export const ROLES = {
  guest: 'guest',
  employee: 'employee',
  admin: 'admin',
} as const;

export const ROLE_LABELS: Record<Role, string> = {
  guest: 'Пользователь',
  employee: 'Сотрудник',
  admin: 'Администратор',
};
