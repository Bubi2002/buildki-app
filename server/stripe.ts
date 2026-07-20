/**
 * ProtoKI – Stripe Payment Integration
 * 
 * Handles:
 * - Checkout Session creation (monthly/yearly)
 * - Webhook processing (subscription lifecycle events)
 * - Subscription status queries
 * - Customer portal for self-service management
 * 
 * Pricing:
 * - Monthly: 12,99 € netto/Monat zzgl. MwSt.
 * - Yearly: 140,00 € netto/Jahr zzgl. MwSt. (~10% Ersparnis)
 */
import Stripe from "stripe";
import type { Express, Request, Response, NextFunction } from "express";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

// Initialize Stripe (lazy – only when key is configured)
let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    stripeInstance = new Stripe(ENV.stripeSecretKey);
  }
  return stripeInstance;
}

// In-memory subscription cache (in production, use database)
interface SubscriptionRecord {
  customerId: string;
  subscriptionId: string;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  plan: "monthly" | "yearly";
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
}

const subscriptionCache = new Map<string, SubscriptionRecord>();

/**
 * Auth middleware for Stripe routes (reuses the same JWT validation as tRPC)
 */
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Register all Stripe-related Express routes
 */
export function registerStripeRoutes(app: Express) {
  // Health check for Stripe configuration (public)
  app.get("/api/stripe/status", (_req: Request, res: Response) => {
    const configured = !!ENV.stripeSecretKey;
    res.json({
      configured,
      monthlyPriceId: ENV.stripeMonthlyPriceId ? "set" : "missing",
      yearlyPriceId: ENV.stripeYearlyPriceId ? "set" : "missing",
    });
  });

  /**
   * POST /api/stripe/create-checkout-session
   * Creates a Stripe Checkout Session for subscription
   * Body: { email: string, plan: "monthly" | "yearly", successUrl?: string, cancelUrl?: string }
   */
  app.post("/api/stripe/create-checkout-session", requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      const { email, plan, successUrl, cancelUrl } = req.body;

      if (!email || !plan) {
        res.status(400).json({ error: "email and plan are required" });
        return;
      }

      if (plan !== "monthly" && plan !== "yearly") {
        res.status(400).json({ error: "plan must be 'monthly' or 'yearly'" });
        return;
      }

      const priceId = plan === "monthly" ? ENV.stripeMonthlyPriceId : ENV.stripeYearlyPriceId;
      if (!priceId) {
        res.status(500).json({ error: `STRIPE_${plan.toUpperCase()}_PRICE_ID not configured` });
        return;
      }

      // Find or create customer
      let customer: Stripe.Customer;
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });
      
      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email,
          metadata: { source: "protoki-app" },
        });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        payment_method_types: ["card", "sepa_debit"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl || "https://protokollapp-c7amcxpp.manus.space/payment-success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: cancelUrl || "https://protokollapp-c7amcxpp.manus.space/payment-cancel",
        subscription_data: {
          trial_period_days: 14,
          metadata: { plan, source: "protoki-app" },
        },
        locale: "de",
        allow_promotion_codes: true,
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        payment_method_collection: "always",
        custom_text: {
          submit: { message: "14 Tage kostenlos testen – danach automatische Verlängerung." },
        },
      });

      res.json({
        sessionId: session.id,
        url: session.url,
      });
    } catch (error: any) {
      console.error("[Stripe] Checkout session error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/create-portal-session
   * Creates a Stripe Customer Portal session for self-service management
   * Body: { email: string }
   */
  app.post("/api/stripe/create-portal-session", requireAuth, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) {
        res.status(404).json({ error: "No customer found for this email" });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: "https://protokollapp-c7amcxpp.manus.space/",
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Portal session error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/stripe/subscription-status?email=...
   * Returns the current subscription status for a user
   */
  app.get("/api/stripe/subscription-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        res.status(400).json({ error: "email query param is required" });
        return;
      }

      // Check cache first
      const cached = subscriptionCache.get(email);
      if (cached) {
        res.json({
          active: cached.status === "active" || cached.status === "trialing",
          ...cached,
        });
        return;
      }

      // Query Stripe
      if (!ENV.stripeSecretKey) {
        res.status(503).json({
          active: false,
          status: "not_configured",
          plan: null,
          message: "Stripe not configured",
        });
        return;
      }

      const stripe = getStripe();
      const customers = await stripe.customers.list({ email, limit: 1 });
      
      if (customers.data.length === 0) {
        res.json({ active: false, status: "no_customer", plan: null });
        return;
      }

      const subscriptions = await stripe.subscriptions.list({
        customer: customers.data[0].id,
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        res.json({ active: false, status: "no_subscription", plan: null });
        return;
      }

      const sub = subscriptions.data[0];
      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceId === ENV.stripeMonthlyPriceId ? "monthly" : "yearly";

      const record: SubscriptionRecord = {
        customerId: customers.data[0].id,
        subscriptionId: sub.id,
        status: sub.status as SubscriptionRecord["status"],
        plan,
        currentPeriodEnd: (sub as any).current_period_end ?? 0,
        cancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? false,
      };

      subscriptionCache.set(email, record);

      res.json({
        active: sub.status === "active" || sub.status === "trialing",
        ...record,
      });
    } catch (error: any) {
      console.error("[Stripe] Status check error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/stripe/webhook
   * Stripe webhook endpoint – processes subscription lifecycle events
   */
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      const sig = req.headers["stripe-signature"] as string;

      let event: Stripe.Event;

      if (!ENV.stripeWebhookSecret) {
        res.status(503).json({ error: "Webhook secret not configured" });
        return;
      }
      if (!sig) {
        res.status(400).json({ error: "Missing stripe-signature header" });
        return;
      }

      try {
        // For webhook signature verification, need raw body
        const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
        event = stripe.webhooks.constructEvent(rawBody, sig, ENV.stripeWebhookSecret);
      } catch (err: any) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message);
        res.status(400).json({ error: "Webhook signature verification failed" });
        return;
      }

      console.log(`[Stripe Webhook] Event: ${event.type}`);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          console.log(`[Stripe] Checkout completed for ${session.customer_email}`);
          break;
        }

        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionChange(stripe, subscription);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          await handleSubscriptionCanceled(stripe, subscription);
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`[Stripe] Payment succeeded: ${invoice.id}`);
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`[Stripe] Payment FAILED: ${invoice.id}`);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Handle subscription created/updated events
 */
async function handleSubscriptionChange(stripe: Stripe, subscription: Stripe.Subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if ((customer as any).deleted) return;

    const email = (customer as Stripe.Customer).email;
    if (!email) return;

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = priceId === ENV.stripeMonthlyPriceId ? "monthly" : "yearly";

    const record: SubscriptionRecord = {
      customerId: (customer as Stripe.Customer).id,
      subscriptionId: subscription.id,
      status: subscription.status as SubscriptionRecord["status"],
      plan,
      currentPeriodEnd: (subscription as any).current_period_end ?? 0,
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end ?? false,
    };

    subscriptionCache.set(email, record);
    console.log(`[Stripe] Subscription ${subscription.status} for ${email} (${plan})`);
  } catch (error: any) {
    console.error("[Stripe] handleSubscriptionChange error:", error.message);
  }
}

/**
 * Handle subscription canceled event
 */
async function handleSubscriptionCanceled(stripe: Stripe, subscription: Stripe.Subscription) {
  try {
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    if ((customer as any).deleted) return;

    const email = (customer as Stripe.Customer).email;
    if (!email) return;

    subscriptionCache.set(email, {
      customerId: (customer as Stripe.Customer).id,
      subscriptionId: subscription.id,
      status: "canceled",
      plan: "monthly",
      currentPeriodEnd: (subscription as any).current_period_end ?? 0,
      cancelAtPeriodEnd: true,
    });

    console.log(`[Stripe] Subscription canceled for ${email}`);
  } catch (error: any) {
    console.error("[Stripe] handleSubscriptionCanceled error:", error.message);
  }
}
