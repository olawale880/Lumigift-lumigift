import { NextRequest, NextResponse } from "next/server";
import { contributeSchema } from "@/types/schemas";
import { initiateContribution } from "@/server/services/group-gift.service";
import { withErrorHandler } from "@/server/middleware";
import type { ApiResponse, GroupContribution } from "@/types";

export const POST = withErrorHandler(async (req: NextRequest, context: unknown) => {
  const { id } = (context as { params: { id: string } }).params;

  const body = await req.json();
  const parsed = contributeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { contribution, paymentUrl } = await initiateContribution(id, parsed.data);

  return NextResponse.json<
    ApiResponse<{ contribution: GroupContribution; paymentUrl: string }>
  >(
    { success: true, data: { contribution, paymentUrl } },
    { status: 201 }
  );
});
