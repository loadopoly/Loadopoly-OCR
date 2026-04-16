/**
 * Sharing Rewards Service
 *
 * Listens for seed adoption events and triggers:
 *  - GARD point accrual for the seed creator
 *  - SEED_CREATOR badge awarding
 *  - Community fund contributions when the seed is community-owned
 *
 * This service is the glue between Phase 2 (seed datasets) and Phase 3
 * (GARD tokenization incentives). It is intentionally side-effect-free
 * with respect to blockchain state — all rewards are tracked in Supabase
 * and can be settled on-chain in a separate batch process.
 *
 * @module sharingRewardsService
 */

import { supabase } from '../lib/supabaseClient';
import { logger } from '../lib/logger';
import { gardRoyaltyEngine } from './gard/royaltyEngine';

// ============================================================
// Types
// ============================================================

/** A pending off-chain reward for a seed creator. */
export interface SeedCreatorReward {
  id: string;
  creatorId: string;
  seedId: string;
  gardPoints: number;
  creatorShare: number;
  communityShare: number;
  maintenanceShare: number;
  adoptionCount: number;
  calculatedAt: string;
  settled: boolean;
}

/** Summary of a creator's seed contribution impact. */
export interface SeedImpactSummary {
  totalSeeds: number;
  totalAdoptions: number;
  totalGardPoints: number;
  estimatedUsdValue: number;
  badges: SeedBadge[];
}

export interface SeedBadge {
  id: string;
  name: string;
  description: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  earnedAt: string;
}

// ============================================================
// Badge thresholds
// ============================================================

const BADGE_THRESHOLDS: { tier: SeedBadge['tier']; adoptions: number; name: string; desc: string }[] = [
  { tier: 'BRONZE', adoptions: 1,   name: 'Seed Creator',       desc: 'Created your first seed dataset' },
  { tier: 'SILVER', adoptions: 10,  name: 'Data Gardener',      desc: 'Seed adopted by 10+ users' },
  { tier: 'GOLD',   adoptions: 100, name: 'Knowledge Cultivator', desc: 'Seed adopted by 100+ users' },
];

const BASE_SHARD_VALUE = 0.01; // USD

// ============================================================
// Public API
// ============================================================

/**
 * Called whenever a new user adopts a seed dataset.
 * Computes GARD rewards for the creator and persists them.
 *
 * @param seedId    - UUID of the seed that was adopted
 * @returns The calculated reward record, or null on failure
 */
export async function onSeedAdopted(seedId: string): Promise<SeedCreatorReward | null> {
  if (!supabase) return null;

  try {
    // 1. Load seed to get creator and current adoption count
    const { data: seedRow, error: seedErr } = await supabase
      .from('seed_datasets')
      .select('id, creator_id, adoption_count')
      .eq('id', seedId)
      .maybeSingle();

    if (seedErr || !seedRow) {
      logger.warn(`[SharingRewards] onSeedAdopted: seed not found (${seedErr?.message})`, {
        module: 'sharingRewards',
      });
      return null;
    }

    const row = seedRow as Record<string, unknown>;
    const creatorId    = row['creator_id'] as string;
    const adoptionCount = (row['adoption_count'] as number) ?? 0;

    // 2. Calculate royalty amounts
    const totalRoyalty  = gardRoyaltyEngine.calculateSeedRoyalties(adoptionCount, BASE_SHARD_VALUE);
    const distribution  = gardRoyaltyEngine.distributeSeedRoyalty(totalRoyalty);
    const gardPoints    = Math.round(adoptionCount * 10); // 10 GARD points per adoption

    // 3. Award badges based on adoption milestones
    await awardSeedBadges(creatorId, adoptionCount);

    // 4. Persist the reward record in pending_rewards (existing GARD table)
    const reward = {
      user_id:    creatorId,
      reward_type: 'seed_adoption' as string,
      amount:     distribution.creatorShare,
      metadata:   {
        seedId,
        adoptionCount,
        gardPoints,
        communityShare:   distribution.communityShare,
        maintenanceShare: distribution.maintenanceShare,
        calculatedAt:     new Date().toISOString(),
      },
    };

    const { error: insertErr } = await (supabase as any)
      .from('pending_rewards')
      .insert(reward);

    if (insertErr) {
      logger.warn(`[SharingRewards] Failed to insert pending reward: ${insertErr.message}`, {
        module: 'sharingRewards',
      });
    }

    // 5. Return the summary for the caller
    // Use crypto.randomUUID (available in all modern browsers and Node 15+).
    // The returned object is an in-memory summary; the canonical ID lives in the DB row.
    return {
      id:               crypto.randomUUID(),
      creatorId,
      seedId,
      gardPoints,
      creatorShare:     distribution.creatorShare,
      communityShare:   distribution.communityShare,
      maintenanceShare: distribution.maintenanceShare,
      adoptionCount,
      calculatedAt:     new Date().toISOString(),
      settled:          false,
    };
  } catch (err: any) {
    logger.error(`[SharingRewards] Unexpected error in onSeedAdopted: ${err?.message}`, {
      module: 'sharingRewards',
    });
    return null;
  }
}

/**
 * Get the sharing impact summary for a given user.
 * Aggregates adoption counts across all their seed datasets.
 *
 * @param creatorId - UUID of the user to summarise
 * @returns SeedImpactSummary
 */
export async function getSeedImpact(creatorId: string): Promise<SeedImpactSummary> {
  const empty: SeedImpactSummary = {
    totalSeeds: 0,
    totalAdoptions: 0,
    totalGardPoints: 0,
    estimatedUsdValue: 0,
    badges: [],
  };

  if (!supabase) return empty;

  try {
    const { data, error } = await supabase
      .from('seed_datasets')
      .select('id, adoption_count')
      .eq('creator_id', creatorId);

    if (error || !data?.length) return empty;

    const rows = data as Array<{ id: string; adoption_count: number }>;
    const totalAdoptions = rows.reduce((sum, r) => sum + (r.adoption_count ?? 0), 0);
    const totalRoyalty   = gardRoyaltyEngine.calculateSeedRoyalties(totalAdoptions, BASE_SHARD_VALUE);
    const distribution   = gardRoyaltyEngine.distributeSeedRoyalty(totalRoyalty);
    const totalGardPoints = Math.round(totalAdoptions * 10);
    const badges = buildBadgesForAdoptions(totalAdoptions);

    return {
      totalSeeds:        rows.length,
      totalAdoptions,
      totalGardPoints,
      estimatedUsdValue: distribution.creatorShare,
      badges,
    };
  } catch (err: any) {
    logger.warn(`[SharingRewards] getSeedImpact failed: ${err?.message}`, { module: 'sharingRewards' });
    return empty;
  }
}

// ============================================================
// Badge helpers
// ============================================================

/** Returns earned badges for a given total adoption count. */
function buildBadgesForAdoptions(totalAdoptions: number): SeedBadge[] {
  const now = new Date().toISOString();
  return BADGE_THRESHOLDS
    .filter(t => totalAdoptions >= t.adoptions)
    .map(t => ({
      id:          `seed_${t.tier.toLowerCase()}`,
      name:        t.name,
      description: t.desc,
      tier:        t.tier,
      earnedAt:    now,
    }));
}

/** Awards SEED_CREATOR-category badges to the creator via the avatar system. */
async function awardSeedBadges(creatorId: string, totalAdoptions: number): Promise<void> {
  if (!supabase) return;

  const badges = buildBadgesForAdoptions(totalAdoptions);
  if (!badges.length) return;

  // Read current avatar badges
  const { data: avatarRow } = await supabase
    .from('user_avatars')
    .select('ID, BADGES')
    .eq('USER_ID', creatorId)
    .maybeSingle();

  if (!avatarRow) return;

  const existing = ((avatarRow as any).BADGES ?? []) as Array<{ id: string }>;
  const existingIds = new Set(existing.map((b) => b.id));

  const newBadges = badges
    .filter(b => !existingIds.has(b.id))
    .map(b => ({
      id:          b.id,
      name:        b.name,
      description: b.description,
      tier:        b.tier,
      earnedAt:    b.earnedAt,
      category:    'CONTRIBUTION' as const,
    }));

  if (!newBadges.length) return;

  await supabase
    .from('user_avatars')
    .update({ BADGES: [...existing, ...newBadges] })
    .eq('ID', (avatarRow as any).ID);
}
