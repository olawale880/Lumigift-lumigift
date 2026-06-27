import type { Gift, GiftStatus, OccasionCategory } from '@/types';
import { createHash } from 'crypto';

/**
 * Generates a deterministic hash for a dummy phone number.
 */
function dummyPhoneHash(): string {
  return createHash('sha256').update('+1234567890').digest('hex');
}

/**
 * Factory function to create a test Gift.
 * Allows overriding any fields for specific test scenarios.
 */
export function createTestGift(overrides?: Partial<Gift>): Gift {
  const defaultGift: Gift = {
    id: `gift-${Date.now()}`,
    senderId: `user-${Date.now()}`,
    recipientPhoneHash: dummyPhoneHash(),
    recipientName: 'Test Recipient',
    recipientEmail: 'recipient@example.com',
    amountNgn: 5000,
    amountUsdc: '10.0000000',
    message: 'Happy testing',
    voiceNoteUrl: undefined,
    mediaUrl: undefined,
    unlockAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    status: 'pending_payment' as GiftStatus,
    occasion: 'general' as OccasionCategory,
    notifyAt: undefined,
    contractId: undefined,
    stellarTxHash: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
  };
  return { ...defaultGift, ...overrides };
}
