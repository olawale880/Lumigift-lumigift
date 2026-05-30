import pool from "@/lib/db";

export interface ClaimAuditLog {
  giftId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: string;
  errorMessage?: string | null;
}

/**
 * Records a gift claim attempt in the audit log.
 */
export async function logClaimAttempt(log: ClaimAuditLog): Promise<void> {
  const query = `
    INSERT INTO claim_audit_log (gift_id, ip_address, user_agent, outcome, error_message)
    VALUES ($1, $2, $3, $4, $5)
  `;
  const values = [
    log.giftId,
    log.ipAddress,
    log.userAgent,
    log.outcome,
    log.errorMessage,
  ];

  try {
    await pool.query(query, values);
  } catch (err) {
    // We don't want to fail the claim process just because logging failed,
    // but we should log the logging failure.
    console.error("[audit] Failed to record claim log:", err);
  }
}

/**
 * Retrieves audit logs for a specific gift.
 */
export async function getClaimLogsByGiftId(giftId: string) {
  const query = `
    SELECT * FROM claim_audit_log
    WHERE gift_id = $1
    ORDER BY timestamp DESC
  `;
  const result = await pool.query(query, [giftId]);
  return result.rows;
}

/**
 * Deletes audit logs older than 2 years.
 */
export async function purgeOldAuditLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);

  const query = `DELETE FROM claim_audit_log WHERE timestamp < $1`;
  const result = await pool.query(query, [cutoff]);
  return result.rowCount || 0;
}
