import { z } from 'zod';

export const RegisterBody = z.object({
  name: z.string().trim().min(1).max(20),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
