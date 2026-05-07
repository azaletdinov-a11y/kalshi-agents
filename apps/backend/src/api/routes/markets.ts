import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

router.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT * FROM markets ORDER BY scanned_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

export default router;
