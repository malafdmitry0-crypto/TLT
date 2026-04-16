import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

export const projectSchema = z.object({
  name: z.string().min(1, 'Название обязательно').max(255),
  description: z.string().optional(),
});

export const pipeParamsSchema = z.object({
  outer_diameter: z.number().positive('Диаметр должен быть положительным'),
  insulation_thickness: z.number().positive('Толщина должна быть положительной'),
  insulation_material: z.string().min(1, 'Выберите материал'),
  ambient_temperature: z.number(),
  process_temperature: z.number(),
  pipe_length: z.number().positive('Длина должна быть положительной'),
  location: z.enum(['indoor', 'outdoor']).optional(),
});

export const tankParamsSchema = z.object({
  shape: z.enum(['cylindrical', 'rectangular', 'spherical']),
  diameter: z.number().positive().optional(),
  height: z.number().positive().optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  insulation_thickness: z.number().positive(),
  insulation_material: z.string().min(1),
  ambient_temperature: z.number(),
  process_temperature: z.number(),
});

export function validateRequired(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}
