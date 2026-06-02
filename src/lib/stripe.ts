import Stripe from "stripe";
import { serverConfig } from "@/server/config";

const stripe = new Stripe(serverConfig.stripe.secretKey, {
  apiVersion: "2024-04-10" as any,
});

export interface CreateCheckoutSessionParams {
  email: string;
  amountCents: number;
  currency: string;
  reference: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

/** Initialize a Stripe Checkout session. */
export async function createCheckoutSession(params: CreateCheckoutSessionParams) {
  const session = await stripe.checkout.sessions.create({
    customer_email: params.email,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: params.currency,
          product_data: {
            name: "Lumigift USDC Funding",
            description: `Gift reference: ${params.reference}`,
          },
          unit_amount: params.amountCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.reference,
    metadata: params.metadata,
  });

  return {
    id: session.id,
    url: session.url as string,
  };
}

/** Verify a Stripe webhook signature and return the event. */
export function constructStripeEvent(payload: string, signature: string) {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    serverConfig.stripe.webhookSecret
  );
}
