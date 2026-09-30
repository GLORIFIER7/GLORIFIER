import crypto from 'node:crypto';
import { capturePayPalOrder, createPayPalOrder } from '../payments/paypal';
import { getPostgresPool } from '../db/postgres';
import { recordRevenueEvent } from './engine';

export type PlanId = 'pro' | 'business';

export const MONETIZATION_PLANS = {
  pro: { id: 'pro' as const, name: 'GLORIFIER Pro', price: '9.99', currency: 'USD', monthlyAiCredits: 1000 },
  business: { id: 'business' as const, name: 'GLORIFIER Business', price: '49.00', currency: 'USD', monthlyAiCredits: 10000 },
};

export async function initializeMonetizationTables() {
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_order_id TEXT NOT NULL UNIQUE,
      customer_reference TEXT NOT NULL,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('pro','business')),
      status TEXT NOT NULL CHECK (status IN ('pending','active','cancelled','expired','payment_failed')),
      currency CHAR(3) NOT NULL,
      amount_minor BIGINT NOT NULL,
      started_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON subscriptions(customer_reference);
    CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

    CREATE TABLE IF NOT EXISTS usage_credits (
      customer_reference TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL CHECK (plan_id IN ('pro','business')),
      monthly_limit INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      period_start DATE NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export function getPlan(planId: string) {
  if (!(planId in MONETIZATION_PLANS)) throw new Error('Unknown plan');
  return MONETIZATION_PLANS[planId as PlanId];
}

export async function createCheckout(customerReference: string, planId: string) {
  if (!customerReference || !/^[a-zA-Z0-9._:@-]{1,128}$/.test(customerReference)) {
    throw new Error('Invalid customer reference');
  }
  const plan = getPlan(planId);
  const referenceId = `glorifier-${plan.id}-${crypto.randomUUID()}`;
  const order = await createPayPalOrder(plan.price, plan.currency, referenceId, {
    planId: plan.id,
    customerReference,
  });
  const approvalUrl = Array.isArray(order.links)
    ? order.links.find((link: { rel?: string }) => link.rel === 'approve')?.href
    : undefined;
  if (!order.id || !approvalUrl) throw new Error('PayPal did not return a checkout approval URL');

  await getPostgresPool().query(
    `INSERT INTO subscriptions
      (provider, provider_order_id, customer_reference, plan_id, status, currency, amount_minor)
     VALUES ('paypal',$1,$2,$3,'pending',$4,$5)
     ON CONFLICT (provider_order_id) DO NOTHING`,
    [order.id, customerReference, plan.id, plan.currency, Math.round(Number(plan.price) * 100)],
  );

  return { orderId: order.id, approvalUrl, plan };
}

export async function captureCheckout(customerReference: string, orderId: string) {
  if (!customerReference || !orderId) throw new Error('Customer reference and order ID are required');
  const result = await capturePayPalOrder(orderId);
  const purchaseUnit = result.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];
  const status = String(result.status || '');
  const captureStatus = String(capture?.status || '');
  const currency = String(capture?.amount?.currency_code || '');
  const amount = String(capture?.amount?.value || '');

  if (status !== 'COMPLETED' || captureStatus !== 'COMPLETED' || !/^[A-Z]{3}$/.test(currency) || !/^\\d+(\\.\\d{1,2})?$/.test(amount)) {
    throw new Error('PayPal payment was not completed');
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const row = await client.query(
      `UPDATE subscriptions
       SET status='active', started_at=COALESCE(started_at,NOW()), expires_at=NOW() + INTERVAL '30 days', updated_at=NOW()
       WHERE provider='paypal' AND provider_order_id=$1 AND customer_reference=$2 AND status='pending'
       RETURNING plan_id, currency, amount_minor`,
      [orderId, customerReference],
    );
    if (row.rowCount !== 1) {
      await client.query('ROLLBACK');
      throw new Error('Checkout is invalid, already processed, or does not belong to this customer');
    }

    const plan = getPlan(row.rows[0].plan_id);
    await client.query(
      `INSERT INTO usage_credits (customer_reference, plan_id, monthly_limit, used, period_start)
       VALUES ($1,$2,$3,0,CURRENT_DATE)
       ON CONFLICT (customer_reference) DO UPDATE SET plan_id=EXCLUDED.plan_id, monthly_limit=EXCLUDED.monthly_limit, used=0, period_start=CURRENT_DATE, updated_at=NOW()`,
      [customerReference, plan.id, plan.monthlyAiCredits],
    );
    await client.query('COMMIT');

    // PayPal's completed capture is authoritative payment evidence. Only after
    // PayPal confirms the capture do we write verified revenue to the GLORIFIER
    // ledger. Checkout creation and AI estimates never create verified revenue.
    const captureId = String(capture?.id || orderId);
    const revenueEvent = await recordRevenueEvent({
      eventId: "paypal:capture:" + captureId,
      provider: 'paypal',
      providerTransactionId: captureId,
      customerReference,
      userReference: customerReference,
      currency,
      amountMinor: Math.round(Number(amount) * 100),
      status: 'paid',
      occurredAt: new Date().toISOString(),
      metadata: {
        orderId,
        planId: plan.id,
        evidence: 'paypal-completed-capture',
        verified: true,
      },
    });

    return {
      active: true,
      orderId,
      plan,
      currency,
      amountMinor: Math.round(Number(amount) * 100),
      verifiedRevenue: true,
      revenueEvent: {
        eventId: "paypal:capture:" + captureId,
        inserted: revenueEvent.inserted,
        ledgerId: revenueEvent.id ?? null,
      },
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function getSubscription(customerReference: string) {
  const result = await getPostgresPool().query(
    `SELECT plan_id, status, currency, amount_minor, started_at, expires_at
     FROM subscriptions WHERE customer_reference=$1
     ORDER BY created_at DESC LIMIT 1`,
    [customerReference],
  );
  return result.rows[0] ?? null;
}
