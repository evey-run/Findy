import { z } from 'zod';

export const CreateUserBody = z.object({
  name: z.string().trim().min(1).max(20),
  avatar: z.string().optional().nullable(),
});

// PUT multipart : seul `name` arrive depuis le body (avatar = req.file)
export const UpdateUserBody = z.object({
  name: z.string().trim().min(1).max(20).optional(),
});
