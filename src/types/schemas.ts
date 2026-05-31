/**
 * @file schemas.ts
 * Backward-compatibility re-export shim.
 *
 * Schema definitions live in `src/lib/schemas/` so they can be shared between
 * frontend and backend. Existing imports from `@/types/schemas` continue to
 * work through this file.
 */

import type { z } from "zod";
import type {
  claimGiftSchema as claimGiftSchemaType,
  createGiftSchema as createGiftSchemaType,
  verifyOtpSchema as verifyOtpSchemaType,
} from "@/lib/schemas";

export { createGiftSchema, verifyOtpSchema, claimGiftSchema } from "@/lib/schemas";

export type CreateGiftInput = z.input<typeof createGiftSchemaType>;
export type VerifyOtpInput = z.input<typeof verifyOtpSchemaType>;
export type ClaimGiftInput = z.input<typeof claimGiftSchemaType>;
