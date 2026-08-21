import type { ObjectType } from '@/constants/objectTypes';

export type OwnerFilter = 'all' | 'mine';
export type StatusFilter = 'all' | 'draft' | 'completed';
/**
 * Тип проекта — вычисляется по составу объектов:
 *   empty   — нет объектов
 *   pipe/tank/pump/platform/other — все объекты одного типа
 *   mixed   — присутствуют объекты разных типов
 */
export type ProjectTypeFilter = 'all' | 'empty' | 'mixed' | ObjectType;

export const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  completed: { text: 'Завершён', color: 'green' },
  draft:     { text: 'Черновик', color: 'default' },
};

export function computeProjectType(types: string[]): ProjectTypeFilter | 'other' {
  if (types.length === 0) return 'empty';
  if (types.length > 1) return 'mixed';
  return types[0] as ObjectType;
}

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  empty: 'Пустой',
  mixed: 'Смешанный',
  pipe: 'Трубопроводы',
  tank: 'Резервуары',
  pump: 'Насосы',
  platform: 'Площадки',
  other: 'Прочее',
};
