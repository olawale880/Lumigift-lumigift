import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import type { ApiResponse } from "@/types";

function isAdmin(req: NextRequest): boolean {
  const token = req.headers.get("authorization");
  return token === `Bearer ${process.env.ADMIN_SECRET}`;
}

export interface AdminGiftRow {
  id: string;
  sender_id: string;
  recipient_phone: string;
  amount_ngn: number;
  status: string;
  unlock_at: string;
  created_at: string;
}

export interface AdminGiftsPage {
  gifts: AdminGiftRow[];
  total: number;
}

export const GET = async (req: NextRequest) => {
  if (!isAdmin(req)) {
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const [giftsResult, countResult] = await Promise.all([
    pool.query<AdminGiftRow>(
      `SELECT id, sender_id, recipient_phone, amount_ngn, status, unlock_at, created_at
       FROM gifts ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM gifts ${where}`,
      params
    ),
  ]);

  return NextResponse.json<ApiResponse<AdminGiftsPage>>({
    success: true,
    data: {
      gifts: giftsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
    },
  });
};
