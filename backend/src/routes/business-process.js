// Business process — get theo code (template definitions)

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.get('/:code', async (req, res) => {
  const db = getDb();
  const bp = await db.prepare('SELECT * FROM business_processes WHERE code = $1').getAsync(req.params.code);
  if (!bp) return res.status(404).json({ error: 'Not found' });
  const steps = await db.prepare('SELECT * FROM business_process_steps WHERE process_id = $1 ORDER BY ordinal').allAsync(bp.id);
  res.json({ ...bp, steps });
});

export default router;
