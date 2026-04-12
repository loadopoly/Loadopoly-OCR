/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe webhook events to fulfill credit purchases.
 * On successful payment (checkout.session.completed), credits are
 * added to the user's account in Supabase.
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY       — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET   — Webhook signing secret
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key for writing credits
 *   VITE_SUPABASE_URL       — Supabase project URL
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Vercel raw body handling — Stripe needs the raw body for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables for webhook');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let event: Stripe.Event;
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const credits = parseInt(session.metadata?.credits || '0', 10);
    const packId = session.metadata?.packId || 'unknown';

    if (!userId || credits <= 0) {
      console.error('Invalid session metadata:', session.metadata);
      return res.status(400).json({ error: 'Invalid metadata' });
    }

    // Upsert credits: add to existing balance or create new row
    const { data: existing, error: fetchErr } = await supabase
      .from('user_credits')
      .select('credits_remaining, total_purchased')
      .eq('user_id', userId)
      .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
      // PGRST116 = row not found, which is expected for first purchase
      console.error('Error fetching user credits:', fetchErr);
      return res.status(500).json({ error: 'Database error' });
    }

    if (existing) {
      const { error: updateErr } = await supabase
        .from('user_credits')
        .update({
          credits_remaining: existing.credits_remaining + credits,
          total_purchased: existing.total_purchased + credits,
          last_purchase_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateErr) {
        console.error('Failed to update credits:', updateErr);
        return res.status(500).json({ error: 'Failed to update credits' });
      }
    } else {
      const { error: insertErr } = await supabase
        .from('user_credits')
        .insert({
          user_id: userId,
          credits_remaining: credits,
          total_purchased: credits,
          free_credits_used: 0,
          last_purchase_at: new Date().toISOString(),
        });

      if (insertErr) {
        console.error('Failed to insert credits:', insertErr);
        return res.status(500).json({ error: 'Failed to insert credits' });
      }
    }

    // Log the transaction
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: credits,
      type: 'purchase',
      pack_id: packId,
      stripe_session_id: session.id,
    }).then(({ error }) => {
      if (error) console.error('Failed to log transaction:', error);
    });

    console.log(`[Webhook] Added ${credits} credits to user ${userId} (pack: ${packId})`);
  }

  return res.status(200).json({ received: true });
}
