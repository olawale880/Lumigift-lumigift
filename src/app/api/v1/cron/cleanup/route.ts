import { NextRequest, NextResponse } from "next/server";
import { processCleanup } from "@/server/services/scheduler.service";
import type { ApiResponse } from "@/types";

/**
 * Called weekly by Vercel Cron.
 * Handles data retention policies (e.g., purging audit logs older than 2 years).
 */
export const GET = async (req: NextRequest) => {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await processCleanup();
  return NextResponse.json<ApiResponse<{ message: string; details: any }>>({
    success: true,
    data: { message: "Cleanup complete", details: result },
  });
};
