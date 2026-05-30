import { randomUUID } from "crypto";
import type { Gift, GiftStatus } from "@/types";
import type { CreateGiftInput } from "@/types/schemas";
import { initializePayment, ngnToKobo } from "@/lib/paystack";
import { createCheckoutSession } from "@/lib/stripe";
import { serverConfig } from "@/server/config";
import { assertValidTransition } from "./gift-state-machine";

// ─── Exchange rate helper ─────────────────────────────────────────────────────
import { getExchangeRate } from "@/server/services/exchange-rate.service";

export async function ngnToUsdc(ngn: number): Promise<string> {
  const { ngnPerUsdc } = await getExchangeRate();
  return (ngn / ngnPerUsdc).toFixed(7);
}

// ─── In-memory store (replace with DB in production) ─────────────────────────
const gifts = new Map<string, Gift>();

export async function createGift(
  senderId: string,
  input: CreateGiftInput
): Promise<{ gift: Gift; paymentUrl: string }> {
  const id = randomUUID();
  const amountUsdc = await ngnToUsdc(input.amountNgn);

  const gift: Gift = {
    id,
    senderId,
    recipientPhone: input.recipientPhone,
    recipientName: input.recipientName,
    amountNgn: input.amountNgn,
    amountUsdc,
    message: input.message,
    unlockAt: new Date(input.unlockAt),
    status: "pending_payment",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  gifts.set(id, gift);

  let paymentUrl: string;
  const reference = `lumigift_${id}`;
  const email = `${senderId}@lumigift.app`; // placeholder; use real email from user record

  if (input.paymentProvider === "stripe") {
    const amountUsd = parseFloat(amountUsdc);
    const session = await createCheckoutSession({
      email,
      amountCents: Math.round(amountUsd * 100),
      currency: "usd",
      reference,
      successUrl: `${serverConfig.app.url}/dashboard?status=success&giftId=${id}`,
      cancelUrl: `${serverConfig.app.url}/send?status=cancelled&giftId=${id}`,
      metadata: { giftId: id, senderId },
    });
    paymentUrl = session.url;
  } else {
    const payment = await initializePayment({
      email,
      amountKobo: ngnToKobo(input.amountNgn),
      reference,
      callbackUrl: `${serverConfig.app.url}/api/payments/callback?giftId=${id}`,
      metadata: { giftId: id, senderId },
    });
    paymentUrl = payment.authorizationUrl;
  }

  return { gift, paymentUrl };
}

export async function getGiftById(id: string): Promise<Gift | null> {
  return gifts.get(id) ?? null;
}

export async function updateGiftStatus(id: string, status: GiftStatus): Promise<Gift | null> {
  const gift = gifts.get(id);
  if (!gift) return null;
  assertValidTransition(gift.status, status);
  gift.status = status;
  gift.updatedAt = new Date();
  gifts.set(id, gift);
  return gift;
}

export async function getGiftsBySender(senderId: string): Promise<Gift[]> {
  return [...gifts.values()].filter((g) => g.senderId === senderId);
}

export interface GiftPage {
  gifts: Gift[];
  total: number;
  nextCursor: string | null;
}

export async function getGiftsBySenderPaginated(
  senderId: string,
  cursor: string | null,
  limit: number
): Promise<GiftPage> {
  const all = [...gifts.values()]
    .filter((g) => g.senderId === senderId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const startIndex = cursor ? all.findIndex((g) => g.id === cursor) + 1 : 0;
  const page = all.slice(startIndex, startIndex + limit);
  const nextCursor = startIndex + limit < all.length ? page[page.length - 1].id : null;

  return { gifts: page, total: all.length, nextCursor };
}

export async function getGiftsByRecipient(phone: string): Promise<Gift[]> {
  return [...gifts.values()].filter((g) => g.recipientPhone === phone);
}

export async function cancelGift(id: string): Promise<Gift | null> {
  const gift = gifts.get(id);
  if (!gift) return null;
  gift.status = "cancelled";
  gift.updatedAt = new Date();
  gifts.set(id, gift);
  return gift;
}

export async function storeClaimTxHash(id: string, txHash: string): Promise<Gift | null> {
  const gift = gifts.get(id);
  if (!gift) return null;
  gift.claimTxHash = txHash;
  gift.updatedAt = new Date();
  gifts.set(id, gift);
  return gift;
}
