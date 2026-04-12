/**
 * Credit System Service
 * 
 * Manages OCR processing credits for the freemium model:
 *   - Free tier: 5 credits (no API key needed, we eat the Gemini cost)
 *   - BYOK: Unlimited (user provides their own Gemini key)
 *   - Paid packs: 50/200/1000 credits via Stripe
 * 
 * Credits are tracked in:
 *   - Supabase `user_credits` table (authenticated users)
 *   - localStorage (unauthenticated guests, capped at FREE_TIER_LIMIT)
 */

import { supabase } from './supabaseService';

const FREE_TIER_LIMIT = 5;
const LOCAL_CREDITS_KEY = 'geograph-free-credits-used';

// Supabase doesn't have generated types for user_credits yet
// Use type assertion for .from() calls
const creditsTable = () => (supabase as any)?.from('user_credits');

export interface CreditBalance {
  creditsRemaining: number;
  totalPurchased: number;
  freeCreditsUsed: number;
  isFreeTier: boolean;
  hasByok: boolean; // Bring Your Own Key
}

export interface CreditPack {
  id: string;
  name: string;
  credits: number;
  price: number; // USD
  popular?: boolean;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'starter', name: 'Starter', credits: 50, price: 9 },
  { id: 'pro', name: 'Pro', credits: 200, price: 29, popular: true },
  { id: 'bulk', name: 'Bulk', credits: 1000, price: 99 },
];

/**
 * Check if the user has their own API key configured (BYOK mode).
 * BYOK users bypass the credit system entirely.
 */
export function hasUserApiKey(): boolean {
  if (typeof localStorage === 'undefined') return false;
  
  const selectedLLM = localStorage.getItem('geograph-selected-llm') || 'Gemini 2.5 Flash';
  const savedKey = localStorage.getItem(`geograph-llm-key-${selectedLLM}`) 
    || localStorage.getItem('geograph-gemini-key');
  
  if (savedKey && savedKey.trim().length > 0) return true;
  
  // Also check env var (developer mode)
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) return true;
  
  return false;
}

/**
 * Get the current credit balance for a user.
 */
export async function getCreditBalance(userId?: string): Promise<CreditBalance> {
  const hasByok = hasUserApiKey();
  
  if (hasByok) {
    return {
      creditsRemaining: Infinity,
      totalPurchased: 0,
      freeCreditsUsed: 0,
      isFreeTier: false,
      hasByok: true,
    };
  }
  
  // Authenticated user: check Supabase
  if (userId && supabase) {
    try {
      const { data, error } = await creditsTable()
        .select('credits_remaining, total_purchased, free_credits_used')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Failed to fetch credits:', error);
      }
      
      if (data) {
        return {
          creditsRemaining: data.credits_remaining,
          totalPurchased: data.total_purchased,
          freeCreditsUsed: data.free_credits_used,
          isFreeTier: data.total_purchased === 0,
          hasByok: false,
        };
      }
      
      // No row yet — user is on free tier
      return {
        creditsRemaining: FREE_TIER_LIMIT,
        totalPurchased: 0,
        freeCreditsUsed: 0,
        isFreeTier: true,
        hasByok: false,
      };
    } catch {
      // Fallback to local
    }
  }
  
  // Guest user: check localStorage
  const freeUsed = parseInt(localStorage.getItem(LOCAL_CREDITS_KEY) || '0', 10);
  return {
    creditsRemaining: Math.max(0, FREE_TIER_LIMIT - freeUsed),
    totalPurchased: 0,
    freeCreditsUsed: freeUsed,
    isFreeTier: true,
    hasByok: false,
  };
}

/**
 * Check if the user can process an image (has credits or BYOK).
 */
export async function canProcess(userId?: string): Promise<boolean> {
  if (hasUserApiKey()) return true;
  
  const balance = await getCreditBalance(userId);
  return balance.creditsRemaining > 0;
}

/**
 * Consume one credit for a processing operation.
 * Returns true if successful, false if insufficient credits.
 */
export async function consumeCredit(userId?: string): Promise<boolean> {
  if (hasUserApiKey()) return true; // BYOK — unlimited
  
  // Authenticated user: decrement in Supabase
  if (userId && supabase) {
    try {
      const { data: existing } = await creditsTable()
        .select('credits_remaining, free_credits_used, total_purchased')
        .eq('user_id', userId)
        .single();
      
      if (existing && existing.credits_remaining > 0) {
        // Paid credits
        await creditsTable()
          .update({
            credits_remaining: existing.credits_remaining - 1,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
        return true;
      }
      
      if (!existing || existing.total_purchased === 0) {
        // Free tier — check if under limit
        const freeUsed = existing?.free_credits_used ?? 0;
        if (freeUsed < FREE_TIER_LIMIT) {
          if (existing) {
            await creditsTable()
              .update({
                free_credits_used: freeUsed + 1,
                credits_remaining: Math.max(0, FREE_TIER_LIMIT - freeUsed - 1),
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId);
          } else {
            await creditsTable()
              .insert({
                user_id: userId,
                credits_remaining: FREE_TIER_LIMIT - 1,
                total_purchased: 0,
                free_credits_used: 1,
              });
          }
          return true;
        }
      }
      
      return false; // No credits left
    } catch (err) {
      console.error('Error consuming credit:', err);
      return false;
    }
  }
  
  // Guest user: localStorage tracking
  const freeUsed = parseInt(localStorage.getItem(LOCAL_CREDITS_KEY) || '0', 10);
  if (freeUsed < FREE_TIER_LIMIT) {
    localStorage.setItem(LOCAL_CREDITS_KEY, String(freeUsed + 1));
    return true;
  }
  
  return false;
}

/**
 * Initiate a Stripe checkout for purchasing credits.
 */
export async function purchaseCredits(packId: string, userId: string): Promise<{ url: string } | { error: string }> {
  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packId, userId }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { error: data.error || 'Purchase failed' };
    }
    
    return { url: data.url };
  } catch (err: any) {
    return { error: err.message || 'Network error' };
  }
}
