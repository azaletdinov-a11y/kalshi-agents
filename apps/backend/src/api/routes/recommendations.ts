import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

router.get('/', async (req, res) => {
  const { outcome = 'pending', limit = '50', offset = '0' } = req.query;
  const result = await db.query(
    `SELECT * FROM recommendations WHERE outcome = $1
     ORDER BY edge DESC, created_at DESC
     LIMIT $2 OFFSET $3`,
    [outcome, Number(limit), Number(offset)]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM recommendations WHERE id = $1',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.patch('/:id/outcome', async (req, res) => {
  const { outcome } = req.body;
  if (!['won', 'lost', 'cancelled'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid outcome' });
  }
  const result = await db.query(
    `UPDATE recommendations SET outcome=$1, resolved_at=NOW() WHERE id=$2 RETURNING *`,
    [outcome, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

export default router;
