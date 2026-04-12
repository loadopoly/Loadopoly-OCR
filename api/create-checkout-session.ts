/**
 * Stripe Checkout Session Creator
 * 
 * Vercel serverless function that creates a Stripe Checkout session
 * for purchasing OCR processing credit packs.
 * 
 * Credit Packs:
 *   - starter:  50 credits  → $9
 *   - pro:     200 credits  → $29
 *   - bulk:   1000 credits  → $99
 * 
 * Environment variables:
 *   STRIPE_SECRET_KEY        — Stripe secret key
 *   VITE_SUPABASE_URL        — Supabase project URL
 *   VITE_SUPABASE_ANON_KEY   — Supabase anon key (service role preferred for server)
 *   STRIPE_WEBHOOK_SECRET    — (used by webhook endpoint, not here)
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const CREDIT_PACKS: Record<string, { credits: number; priceInCents: number; name: string }> = {
  starter: { credits: 50, priceInCents: 900, name: '50 OCR Credits' },
  pro: { credits: 200, priceInCents: 2900, name: '200 OCR Credits' },
  bulk: { credits: 1000, priceInCents: 9900, name: '1000 OCR Credits' },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  const { packId, userId } = req.body;

  if (!packId || !userId) {
    return res.status(400).json({ error: 'Missing packId or userId' });
  }

  const pack = CREDIT_PACKS[packId];
  if (!pack) {
    return res.status(400).json({ error: `Invalid pack: ${packId}. Valid: ${Object.keys(CREDIT_PACKS).join(', ')}` });
  }

  // Verify the user exists in Supabase
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authUser?.user) {
      return res.status(403).json({ error: 'User not found' });
    }
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any });

    const successUrl = `${req.headers.origin || 'https://loadopoly-ocr.vercel.app'}/?checkout=success&pack=${packId}`;
    const cancelUrl = `${req.headers.origin || 'https://loadopoly-ocr.vercel.app'}/?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: pack.name,
              description: `${pack.credits} OCR processing credits for GeoGraph`,
            },
            unit_amount: pack.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        packId,
        credits: String(pack.credits),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
}
