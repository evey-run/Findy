import { z } from 'zod';
import { IdString, AccountType, HexColor, BoolFromString } from './common';

export const ListBanksQuery = z.object({
  userId: IdString.optional(),
  archived: BoolFromString,
});

/**
 * POST/PUT /api/banks utilisent multipart/form-data → tous les champs arrivent en strings.
 * Multer expose `userIds` soit comme array natif (`userIds: ['a','b']`) soit comme clés
 * indexées (`userIds[0]`, `userIds[1]`). On accepte les deux et la route normalise via extractUserIds.
 *
 * On ne valide ici que les champs scalaires ; les userIds sont validés à part dans la route
 * car ils peuvent prendre deux formats.
 */
export const CreateBankBody = z.object({
  name: z.string().trim().min(1).max(100),
  shortName: z.string().trim().max(10).optional(),
  color: HexColor.optional(),
  iban: z.string().trim().max(50).optional(),
  balance: z.coerce.number().optional(),
  accountType: AccountType.optional(),
  createdAt: z.string().optional(),
  // userIds peut être string (un seul) ou array de strings
  userIds: z
    .union([IdString, z.array(IdString)])
    .optional(),
});

/**
 * PUT supporte deux modes : champs directs (multipart) OU un champ `data` JSON.
 * On valide seulement la présence du body et on déporte le parsing dans la route.
 */
export const UpdateBankBody = z.record(z.string(), z.any()).optional();
