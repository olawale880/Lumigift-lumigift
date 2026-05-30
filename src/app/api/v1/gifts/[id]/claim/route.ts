import { NextRequest, NextResponse } from "next/server";
import { getGiftById } from "@/server/services/gift.service";
import { claimGift } from "@/server/services/claim.service";
import { logClaimAttempt } from "@/server/services/audit.service";
import { claimGiftSchema } from "@/types/schemas";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse } from "@/types";

export const POST = withErrorHandler(async (req: NextRequest) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";

  const body = await req.json();
  const parsed = claimGiftSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { giftId, recipientStellarKey } = parsed.data;

  const gift = await getGiftById(giftId);
  if (!gift) {
    await logClaimAttempt({
      giftId,
      ipAddress: ip,
      userAgent: ua,
      outcome: "failed:not_found",
      errorMessage: "Gift not found",
    });
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Gift not found" },
      { status: 404 }
    );
  }

  try {
    const { txHash } = await claimGift(gift, recipientStellarKey);

    await logClaimAttempt({
      giftId,
      ipAddress: ip,
      userAgent: ua,
      outcome: "success",
    });

    return NextResponse.json<ApiResponse<{ txHash: string }>>({
      success: true,
      data: { txHash },
    });
  } catch (error: any) {
    const outcome =
      error.message === "Gift is not yet unlocked."
        ? "failed:not_unlocked"
        : "failed:error";

    await logClaimAttempt({
      giftId,
      ipAddress: ip,
      userAgent: ua,
      outcome,
      errorMessage: error.message,
    });
    
    // If it's a business logic error we want to return a 400, not a 500
    if (outcome === "failed:not_unlocked") {
       return NextResponse.json<ApiResponse<never>>(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    throw error;
  }
});
