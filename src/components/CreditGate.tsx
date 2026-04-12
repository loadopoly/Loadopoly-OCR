import React, { useState, useEffect } from 'react';
import { Coins, Key, Zap, Check, ExternalLink, Loader2 } from 'lucide-react';
import { CreditBalance, CREDIT_PACKS, getCreditBalance, purchaseCredits, hasUserApiKey } from '../services/creditService';

interface CreditGateProps {
  userId?: string;
  onBypassWithKey: () => void;
  onContinue: () => void;
}

/**
 * CreditGate is shown when a user tries to process an image
 * but has no credits remaining and no BYOK API key.
 * 
 * Options:
 *   1. Purchase credit packs via Stripe
 *   2. Enter their own Gemini API key (BYOK)
 */
export default function CreditGate({ userId, onBypassWithKey, onContinue }: CreditGateProps) {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCreditBalance(userId).then(setBalance);
  }, [userId]);

  const handlePurchase = async (packId: string) => {
    if (!userId) {
      setError('Please sign in to purchase credits.');
      return;
    }
    
    setPurchasing(packId);
    setError(null);
    
    const result = await purchaseCredits(packId, userId);
    
    if ('error' in result) {
      setError(result.error);
      setPurchasing(null);
    } else if (result.url) {
      window.location.href = result.url;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Coins size={24} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Processing Credits Needed</h2>
              <p className="text-sm text-slate-400">
                {balance && balance.freeCreditsUsed >= 5
                  ? "You've used all 5 free credits."
                  : "Choose a plan to continue processing."}
              </p>
            </div>
          </div>
        </div>

        {/* Credit Packs */}
        <div className="p-6 space-y-3">
          {CREDIT_PACKS.map((pack) => (
            <button
              key={pack.id}
              onClick={() => handlePurchase(pack.id)}
              disabled={purchasing !== null}
              className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                pack.popular
                  ? 'border-primary-500/50 bg-primary-500/5 hover:bg-primary-500/10'
                  : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
              } ${purchasing === pack.id ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${pack.popular ? 'bg-primary-500/20' : 'bg-slate-800'}`}>
                  <Zap size={18} className={pack.popular ? 'text-primary-400' : 'text-slate-400'} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{pack.credits} Credits</span>
                    {pack.popular && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-500/20 text-primary-300 border border-primary-500/30">
                        POPULAR
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    ${(pack.price / pack.credits).toFixed(2)}/credit
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-white">${pack.price}</span>
                {purchasing === pack.id && <Loader2 size={16} className="animate-spin text-primary-400" />}
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="px-6">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span className="text-xs text-slate-500 uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>
        </div>

        {/* BYOK Option */}
        <div className="p-6 pt-4">
          <button
            onClick={onBypassWithKey}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-700 hover:border-slate-600 hover:bg-slate-800/50 transition-all text-sm"
          >
            <Key size={16} className="text-emerald-400" />
            <span className="text-slate-300">Use your own Gemini API key</span>
            <span className="text-xs text-slate-500">(unlimited, free)</span>
          </button>
        </div>

        {/* Free tier info */}
        {balance && balance.isFreeTier && balance.creditsRemaining > 0 && (
          <div className="px-6 pb-6">
            <button
              onClick={onContinue}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-sm"
            >
              <Check size={16} className="text-emerald-400" />
              <span className="text-emerald-300">
                Use free credit ({balance.creditsRemaining} remaining)
              </span>
            </button>
          </div>
        )}

        {error && (
          <div className="px-6 pb-4">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-6 text-center">
          <p className="text-[11px] text-slate-500">
            Payments processed securely via Stripe. Credits never expire.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline credit display for the status bar or header.
 */
export function CreditBadge({ userId }: { userId?: string }) {
  const [balance, setBalance] = useState<CreditBalance | null>(null);

  useEffect(() => {
    getCreditBalance(userId).then(setBalance);
    
    // Refresh on checkout return
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setTimeout(() => getCreditBalance(userId).then(setBalance), 2000);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [userId]);

  if (!balance || balance.hasByok) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-[11px] font-medium">
        <Key size={10} />
        <span>BYOK</span>
      </div>
    );
  }

  const isLow = balance.creditsRemaining <= 5 && balance.creditsRemaining > 0;
  const isEmpty = balance.creditsRemaining <= 0;

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
      isEmpty
        ? 'bg-red-500/10 border-red-500/20 text-red-400'
        : isLow
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          : 'bg-primary-500/10 border-primary-500/20 text-primary-400'
    }`}>
      <Coins size={10} />
      <span>{balance.creditsRemaining === Infinity ? '∞' : balance.creditsRemaining}</span>
    </div>
  );
}
