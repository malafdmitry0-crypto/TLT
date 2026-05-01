import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

export const projectSchema = z.object({
  name: z.string().min(1, 'Название обязательно').max(200),
  task_number: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
});

export const pipeParamsSchema = z.object({
  outer_diameter: z.number().min(0.01).max(3),
  insulation_thickness: z.number().min(0.001).max(0.5),
  insulation_material: z.string().min(1, 'Выберите материал'),
  ambient_temperature: z.number().min(-60).max(50),
  process_temperature: z.number().min(-60).max(350),
  pipe_length: z.number().min(0.5).max(10_000),
  location: z.enum(['indoor', 'outdoor']).optional(),
}).refine((v) => v.process_temperature > v.ambient_temperature, {
  message: 'Требуемая температура должна быть выше температуры окружающей среды',
  path: ['process_temperature'],
});

export const tankParamsSchema = z.object({
  shape: z.enum(['cylindrical', 'rectangular', 'spherical']),
  diameter: z.number().positive().optional(),
  height: z.number().positive().optional(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  insulation_thickness: z.number().min(0.001).max(0.5),
  insulation_material: z.string().min(1),
  ambient_temperature: z.number().min(-60).max(50),
  process_temperature: z.number().min(-60).max(350),
}).refine((v) => v.process_temperature > v.ambient_temperature, {
  message: 'Требуемая температура должна быть выше температуры окружающей среды',
  path: ['process_temperature'],
});

export function validateRequired(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}
