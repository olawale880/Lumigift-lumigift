import { NextResponse } from "next/server";
import { getExchangeRate } from "@/server/services/exchange-rate.service";

/**
 * GET /api/v1/exchange-rate
 * Returns the current NGN/USDC exchange rate.
 *
 * Optional query param: ?ngn=1000
 * If provided, also returns the USDC equivalent for that amount.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amountNgn = parseFloat(searchParams.get("ngn") ?? "0");

    const { ngnPerUsdc, stale, source } = await getExchangeRate();

    const response: any = {
      success: true,
      data: {
        ngnPerUsdc,
        stale,
        source,
        timestamp: Date.now(),
      },
    };

    if (amountNgn > 0) {
      response.data.amountNgn = amountNgn;
      response.data.amountUsdc = parseFloat((amountNgn / ngnPerUsdc).toFixed(2));
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/exchange-rate] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}
