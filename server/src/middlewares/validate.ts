import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodType } from 'zod';

export interface ValidateSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Middleware générique de validation Zod.
 *
 * - Parse chaque section présente dans `schemas` ; remplace `req.*` par la version typée.
 * - Renvoie 400 avec le détail des erreurs Zod (`.flatten()`) en cas d'échec.
 * - Les sections absentes du schéma ne sont pas touchées.
 *
 * Usage :
 *   router.post('/', validate({ body: CreateThingBody }), handler);
 */
export function validate(schemas: ValidateSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        // Express 5 expose req.query en lecture seule ; on assigne via Object.defineProperty si besoin.
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true });
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
      }
      next(err);
    }
  };
}
