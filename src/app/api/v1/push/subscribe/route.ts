import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { subscribeUserToPush } from "@/server/services/push-notifications.service";
import { withErrorHandler, validateRequest } from "@/server/middleware";
import type { ApiResponse } from "@/types";

const subscribeSchema = {
  endpoint: (val: unknown) => typeof val === "string" && val.length > 0,
  keys: (val: unknown) => {
    if (!val || typeof val !== "object") return false;
    const k = val as Record<string, unknown>;
    return typeof k.p256dh === "string" && typeof k.auth === "string";
  },
};

async function handler(req: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const validation = validateRequest(subscribeSchema, body);
  if (!validation.success) return validation.errorResponse;

  await subscribeUserToPush(
    session.user.id,
    validation.data,
    req.headers.get("user-agent") || undefined
  );

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: "Subscribed to push notifications" },
  });
}

export const POST = withErrorHandler(handler);
