import { z } from "zod";

export const createGiftSchema = z.object({
  recipientPhone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number"),
  recipientName: z.string().min(2, "Name must be at least 2 characters"),
  amountNgn: z
    .number()
    .min(500, "Minimum gift amount is ₦500")
    .max(10_000_000, "Maximum gift amount is ₦10,000,000"),
  message: z.string().max(500, "Message cannot exceed 500 characters").optional(),
  unlockAt: z
    .string()
    .datetime()
    .refine((val) => new Date(val) > new Date(), "Unlock date must be in the future"),
  paymentProvider: z.enum(["paystack", "stripe"]),
});

export const verifyOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const claimGiftSchema = z.object({
  giftId: z.string().uuid(),
  recipientStellarKey: z.string().length(56, "Invalid Stellar public key"),
});

export const createGroupGiftSchema = z.object({
  recipientPhone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid phone number"),
  recipientName: z.string().min(2, "Name must be at least 2 characters"),
  targetAmountNgn: z
    .number()
    .min(500, "Minimum target is ₦500")
    .max(10_000_000, "Maximum target is ₦10,000,000"),
  message: z.string().max(500).optional(),
  unlockAt: z
    .string()
    .datetime()
    .refine((val) => new Date(val) > new Date(), "Unlock date must be in the future"),
  deadline: z
    .string()
    .datetime()
    .refine((val) => new Date(val) > new Date(), "Deadline must be in the future"),
});

export const contributeSchema = z.object({
  contributorName: z.string().min(2, "Name must be at least 2 characters"),
  contributorPhone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/)
    .optional(),
  amountNgn: z.number().min(100, "Minimum contribution is ₦100"),
});

export type CreateGiftInput = z.infer<typeof createGiftSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ClaimGiftInput = z.infer<typeof claimGiftSchema>;
export type CreateGroupGiftInput = z.infer<typeof createGroupGiftSchema>;
export type ContributeInput = z.infer<typeof contributeSchema>;
