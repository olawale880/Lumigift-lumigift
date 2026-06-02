import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

function isAdmin(req: NextRequest): boolean {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export const PATCH = async (
  req: NextRequest,
  { params }: { params: { userId: string } }
) => {
  if (!isAdmin(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { banned } = await req.json() as { banned: boolean };
  await pool.query(
    `UPDATE users SET banned = $1, updated_at = NOW() WHERE id = $2`,
    [banned, params.userId]
  );

  return NextResponse.json<ApiResponse<{ message: string }>>({
    success: true,
    data: { message: banned ? "User banned" : "User unbanned" },
  });
};
