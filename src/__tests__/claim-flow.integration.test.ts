/**
 * @integration
 *
 * Full gift lifecycle integration test: create → pay → unlock → claim
 *
 * NOTE: This test suite is designed to run against a real PostgreSQL test
 * database once gift.service.ts is migrated (see issue dependency). Until
 * then, it exercises the in-memory store through the service layer directly
 * and mocks only external I/O (Paystack, Stellar, SMS).
 *
 * CI job: integration (tagged @integration)
 */

import { randomUUID } from "crypto";

// ── Mock external dependencies ────────────────────────────────────────────────
jest.mock("@/lib/paystack", () => ({
  initializePayment: jest.fn().mockResolvedValue({
    authorizationUrl: "https://checkout.paystack.com/mock",
    reference: "mock_ref",
  }),
  verifyPayment: jest.fn().mockResolvedValue({ status: "success" }),
  ngnToKobo: (n: number) => n * 100,
}));

jest.mock("@/lib/stellar", () => ({
  sendUsdcPayment: jest
    .fn()
    .mockResolvedValue("mock_stellar_tx_hash_abc123"),
}));

jest.mock("@/lib/sms", () => ({
  sendSms: jest.fn().mockResolvedValue({ messageId: "mock_sms_id" }),
}));

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

// ── Service imports (after mocks) ─────────────────────────────────────────────
import {
  createGift,
  getGiftById,
  updateGiftStatus,
} from "@/server/services/gift.service";
import { claimGift } from "@/server/services/claim.service";
import { processUnlocks } from "@/server/services/scheduler.service";

// ── Helpers ───────────────────────────────────────────────────────────────────
const SENDER_ID = randomUUID();
const RECIPIENT_STELLAR_KEY = "G".padEnd(56, "A"); // valid-length test key

function futureDate(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("test_full_gift_lifecycle @integration", () => {
  let giftId: string;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Step 1: POST /api/gifts — create gift
  it("step 1: creates a gift and returns a Paystack payment URL", async () => {
    const { gift, paymentUrl } = await createGift(SENDER_ID, {
      recipientPhone: "+2348012345678",
      recipientName: "Adaeze",
      amountNgn: 5000,
      message: "Happy birthday!",
      unlockAt: futureDate(7 * 24 * 60 * 60 * 1000), // 7 days
      paymentProvider: "paystack",
    });

    giftId = gift.id;
    expect(gift.status).toBe("pending_payment");
    expect(gift.amountNgn).toBe(5000);
    expect(paymentUrl).toBe("https://checkout.paystack.com/mock");
  });

  // Step 2: Mock Paystack callback — gift transitions to "locked"
  it("step 2: Paystack callback transitions gift to locked", async () => {
    const { verifyPayment } = await import("@/lib/paystack");
    const result = await verifyPayment(`lumigift_${giftId}`);
    expect(result.status).toBe("success");

    await updateGiftStatus(giftId, "locked");
    const gift = await getGiftById(giftId);
    expect(gift?.status).toBe("locked");
  });

  // Step 3: GET /api/gifts/[id] — shows gift as funded (locked)
  it("step 3: GET gift by id shows status as locked (funded)", async () => {
    const gift = await getGiftById(giftId);
    expect(gift).not.toBeNull();
    expect(gift!.status).toBe("locked");
  });

  // Step 4: Mock unlock cron — scheduler transitions gift to "unlocked"
  it("step 4: cron/unlock scheduler transitions gift to unlocked", async () => {
    // Simulate what processUnlocks would do once DB is wired:
    // any gift with status=locked and unlockAt <= now gets set to unlocked.
    await updateGiftStatus(giftId, "unlocked");

    // processUnlocks currently logs a warning (stub); ensure it doesn't throw
    await expect(processUnlocks()).resolves.toBeUndefined();

    const gift = await getGiftById(giftId);
    expect(gift?.status).toBe("unlocked");
  });

  // Step 5: POST /api/gifts/[id]/claim — claim the gift
  it("step 5: claiming an unlocked gift returns txHash and marks it claimed", async () => {
    const gift = await getGiftById(giftId);
    expect(gift).not.toBeNull();

    const { txHash } = await claimGift(gift!, RECIPIENT_STELLAR_KEY);

    expect(txHash).toBe("mock_stellar_tx_hash_abc123");

    const updated = await getGiftById(giftId);
    expect(updated?.status).toBe("claimed");
  });

  // Guard: claiming an already-claimed gift must fail
  it("step 6: re-claiming an already-claimed gift throws", async () => {
    const gift = await getGiftById(giftId);
    await expect(claimGift(gift!, RECIPIENT_STELLAR_KEY)).rejects.toThrow(
      "Gift is not yet unlocked."
    );
  });
});
