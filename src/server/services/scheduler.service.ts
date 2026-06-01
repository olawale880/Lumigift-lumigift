import pool from "@/lib/db";

/**
 * Unlock scheduler — finds locked gifts whose unlockAt has passed and
 * transitions them to "unlocked".
 * Returns the count of gifts processed.
 */
export async function processUnlocks(): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM gifts WHERE status = 'locked' AND unlock_at <= NOW()`
  );

  if (rows.length === 0) return 0;

  const ids = rows.map((r) => r.id);
  await pool.query(
    `UPDATE gifts SET status = 'unlocked', updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  console.log(`[scheduler] unlocked ${ids.length} gift(s)`);
  return ids.length;
}

/**
 * Expiry scheduler — marks unlocked gifts unclaimed for 365+ days as "expired".
 */
export async function processExpiries(): Promise<void> {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM gifts WHERE status = 'unlocked' AND unlock_at <= $1`,
    [cutoff]
  );

  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  await pool.query(
    `UPDATE gifts SET status = 'expired', updated_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  console.log(`[scheduler] expired ${ids.length} gift(s)`);
}
