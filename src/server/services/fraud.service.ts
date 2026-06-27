/**
 * Fraud detection service.
 *
 * Implements three independent rules evaluated before gift creation:
 *  1. Velocity limit   — max N gifts per sender in a rolling 24-hour window
 *  2. Single-amount    — single gift exceeds the large-amount threshold
 *  3. New-account      — account younger than MIN_ACCOUNT_AGE_DAYS AND amount
 *                        exceeds the new-account threshold
 *
 * Each rule returns a {@link FraudCheckResult}. The composite
 * {@link checkFraud} returns the first triggered rule or `{ blocked: false }`.
 */

export interface FraudCheckResult {
  blocked: boolean;
  reason?: string;
}

export interface FraudCheckInput {
  /** Sender's user ID */
  senderId: string;
  /** Gift amount in NGN */
  amountNgn: number;
  /** Number of gifts this sender created in the last 24 hours */
  giftsLast24h: number;
  /** Age of the sender's account in days */
  accountAgeDays: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Maximum gifts allowed per sender in a rolling 24-hour window. */
export const VELOCITY_LIMIT = 10;

/** A single gift above this NGN amount triggers the large-amount rule. */
export const LARGE_AMOUNT_THRESHOLD_NGN = 200_000;

/** New accounts (younger than this) face a lower amount cap. */
export const MIN_ACCOUNT_AGE_DAYS = 30;

/** New-account amount cap in NGN. */
export const NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN = 50_000;

// ─── Individual rules ─────────────────────────────────────────────────────────

/**
 * Blocks senders who have hit the 24-hour velocity limit.
 * Triggered when `giftsLast24h >= VELOCITY_LIMIT`.
 */
export function checkVelocity(giftsLast24h: number): FraudCheckResult {
  if (giftsLast24h >= VELOCITY_LIMIT) {
    return { blocked: true, reason: "velocity_limit_exceeded" };
  }
  return { blocked: false };
}

/**
 * Blocks a single gift that exceeds the large-amount threshold.
 * Triggered when `amountNgn > LARGE_AMOUNT_THRESHOLD_NGN`.
 */
export function checkLargeAmount(amountNgn: number): FraudCheckResult {
  if (amountNgn > LARGE_AMOUNT_THRESHOLD_NGN) {
    return { blocked: true, reason: "single_large_amount" };
  }
  return { blocked: false };
}

/**
 * Blocks new accounts from sending above the new-account threshold.
 * Triggered when `accountAgeDays < MIN_ACCOUNT_AGE_DAYS` AND
 * `amountNgn > NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN`.
 */
export function checkNewAccountLargeAmount(
  accountAgeDays: number,
  amountNgn: number
): FraudCheckResult {
  if (
    accountAgeDays < MIN_ACCOUNT_AGE_DAYS &&
    amountNgn > NEW_ACCOUNT_AMOUNT_THRESHOLD_NGN
  ) {
    return { blocked: true, reason: "new_account_large_amount" };
  }
  return { blocked: false };
}

// ─── Composite check ─────────────────────────────────────────────────────────

/**
 * Runs all fraud rules against the given input and returns the first
 * triggered rule or `{ blocked: false }` if all rules pass.
 *
 * Rules are evaluated in order: velocity → large-amount → new-account.
 */
export function checkFraud(input: FraudCheckInput): FraudCheckResult {
  const velocity = checkVelocity(input.giftsLast24h);
  if (velocity.blocked) return velocity;

  const largeAmount = checkLargeAmount(input.amountNgn);
  if (largeAmount.blocked) return largeAmount;

  const newAccount = checkNewAccountLargeAmount(input.accountAgeDays, input.amountNgn);
  if (newAccount.blocked) return newAccount;

  return { blocked: false };
}
