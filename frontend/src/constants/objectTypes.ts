export type ObjectType = 'pipe' | 'tank' | 'pump' | 'platform' | 'other';

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  pipe: 'Трубы',
  tank: 'Резервуары',
  pump: 'Насосы',
  platform: 'Площадки',
  other: 'Прочее',
};
