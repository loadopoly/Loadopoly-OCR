/**
 * Avatar Service
 * 
 * Manages user avatar persistence, real-time presence tracking,
 * and exploration progression for the metaverse layer.
 * 
 * Note: Uses type assertions for metaverse tables which are added
 * via sql/AVATAR_PERSISTENCE_SCHEMA.sql migration
 */

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

// Type assertion helper for metaverse tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ============================================
// Types
// ============================================

export interface AvatarState {
  id: string;
  userId: string;
  displayName: string;
  avatarModel: string;
  avatarColor: string;
  lastPosition: [number, number, number];
  lastRotation: [number, number, number, number];
  lastSector: string;
  contributionLevel: number;
  totalNodesCreated: number;
  totalShardsEarned: number;
  explorationPoints: number;
  badges: AvatarBadge[];
  lastSeen: string;
}

export interface AvatarBadge {
  id: string;
  name: string;
  description: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  earnedAt: string;
  category: 'CONTRIBUTION' | 'EXPLORATION' | 'COLLABORATION' | 'GOVERNANCE';
}

export interface PresenceState {
  userId: string;
  sessionId: string;
  sector: string;
  position: [number, number, number];
  status: 'ACTIVE' | 'IDLE' | 'AWAY';
  displayName?: string;
  avatarColor?: string;
}

export interface WorldSector {
  id: string;
  sectorCode: string;
  center: [number, number, number];
  radius: number;
  aestheticTheme: string;
  zoneType: string;
  nodeCount: number;
  assetCount: number;
}

// ============================================
// Avatar Service Class
// ============================================

class AvatarService {
  private sessionId: string;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentUserId: string | null = null;

  constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Initialize or fetch user avatar on login
   */
  async initializeAvatar(userId: string): Promise<AvatarState | null> {
    if (!isSupabaseConfigured() || !db) {
      console.warn('Supabase not configured - avatar features disabled');
      return null;
    }

    this.currentUserId = userId;

    try {
      // Try to fetch existing avatar
      const { data: existing, error: fetchError } = await db
        .from('user_avatars')
        .select('*')
        .eq('USER_ID', userId)
        .single();

      if (existing && !fetchError) {
        // Update last seen
        await db
          .from('user_avatars')
          .update({ LAST_SEEN: new Date().toISOString() })
          .eq('USER_ID', userId);

        return this.mapRowToAvatar(existing);
      }

      // Create new avatar for first-time user
      const { data: created, error: createError } = await db
        .from('user_avatars')
        .insert({
          USER_ID: userId,
          DISPLAY_NAME: `Explorer_${userId.slice(0, 6)}`,
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create avatar:', createError);
        return null;
      }

      return this.mapRowToAvatar(created);
    } catch (error) {
      console.error('Avatar initialization error:', error);
      return null;
    }
  }

  /**
   * Update avatar display settings
   */
  async updateAvatarSettings(
    userId: string,
    settings: Partial<{
      displayName: string;
      avatarModel: string;
      avatarColor: string;
    }>
  ): Promise<boolean> {
    if (!db) return false;

    const updateData: Record<string, unknown> = {};
    if (settings.displayName) updateData.DISPLAY_NAME = settings.displayName;
    if (settings.avatarModel) updateData.AVATAR_MODEL = settings.avatarModel;
    if (settings.avatarColor) updateData.AVATAR_COLOR = settings.avatarColor;

    const { error } = await db
      .from('user_avatars')
      .update(updateData)
      .eq('USER_ID', userId);

    return !error;
  }

  /**
   * Save avatar position when user navigates
   */
  async savePosition(
    userId: string,
    position: [number, number, number],
    rotation: [number, number, number, number],
    sector: string
  ): Promise<void> {
    if (!db) return;

    await db
      .from('user_avatars')
      .update({
        LAST_POSITION: position,
        LAST_ROTATION: rotation,
        LAST_SECTOR: sector,
        LAST_SEEN: new Date().toISOString(),
      })
      .eq('USER_ID', userId);
  }

  /**
   * Start presence heartbeat for real-time visibility
   */
  async startPresence(
    userId: string,
    sector: string,
    position: [number, number, number] = [0, 0, 0]
  ): Promise<void> {
    if (!db) return;

    // Clean up any existing session
    await this.endPresence();

    // Register new session
    const { error } = await db.from('presence_sessions').insert({
      USER_ID: userId,
      SESSION_ID: this.sessionId,
      SECTOR: sector,
      WORLD_POSITION: position,
      STATUS: 'ACTIVE',
    });

    if (error) {
      console.error('Failed to start presence:', error);
      return;
    }

    // Start heartbeat (every 30 seconds)
    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, 30000);

    // Set up idle detection
    this.setupIdleDetection();
  }

  /**
   * Update current position in presence
   */
  async updatePresencePosition(
    position: [number, number, number],
    sector?: string
  ): Promise<void> {
    if (!db) return;

    const updates: Record<string, unknown> = {
      WORLD_POSITION: position,
      HEARTBEAT_AT: new Date().toISOString(),
    };

    if (sector) {
      updates.SECTOR = sector;
    }

    await db
      .from('presence_sessions')
      .update(updates)
      .eq('SESSION_ID', this.sessionId);
  }

  /**
   * Get all users currently in a sector
   */
  async getSectorPresence(sector: string): Promise<PresenceState[]> {
    if (!db) return [];

    // Use the RPC function for efficient join
    const { data, error } = await db
      .rpc('get_sector_presence', { p_sector: sector });

    if (error) {
      console.error('Failed to get sector presence:', error);
      return [];
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      userId: row.user_id as string,
      sessionId: row.session_id as string,
      sector: sector,
      position: (row.world_position as [number, number, number]) || [0, 0, 0],
      status: (row.status as 'ACTIVE' | 'IDLE' | 'AWAY') || 'ACTIVE',
      displayName: row.display_name as string | undefined,
      avatarColor: row.avatar_color as string | undefined,
    }));
  }

  /**
   * Subscribe to real-time presence changes in a sector
   */
  subscribeSectorPresence(
    sector: string,
    onUpdate: (presence: PresenceState[]) => void
  ): () => void {
    if (!db) return () => {};

    const channel = db
      .channel(`presence:${sector}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'presence_sessions',
          filter: `SECTOR=eq.${sector}`,
        },
        async () => {
          // Refetch presence list on any change
          const presence = await this.getSectorPresence(sector);
          onUpdate(presence);
        }
      )
      .subscribe();

    // Initial fetch
    this.getSectorPresence(sector).then(onUpdate);

    return () => {
      db.removeChannel(channel);
    };
  }

  /**
   * Award exploration points for visiting new sectors
   */
  async awardExplorationPoints(userId: string, points: number): Promise<number> {
    if (!db) return 0;

    const { data, error } = await db
      .rpc('increment_exploration_points', {
        p_user_id: userId,
        p_points: points,
      });

    if (error) {
      console.error('Failed to award exploration points:', error);
      return 0;
    }

    return data || 0;
  }

  /**
   * Update contribution stats after asset creation
   */
  async updateContribution(
    userId: string,
    nodesDelta: number = 0,
    shardsDelta: number = 0
  ): Promise<void> {
    if (!db) return;

    await db.rpc('update_avatar_contribution', {
      p_user_id: userId,
      p_nodes_delta: nodesDelta,
      p_shards_delta: shardsDelta,
    });
  }

  /**
   * Get world sector info
   */
  async getSector(sectorCode: string): Promise<WorldSector | null> {
    if (!db) return null;

    const { data, error } = await db
      .from('world_sectors')
      .select('*')
      .eq('SECTOR_CODE', sectorCode)
      .single();

    if (error || !data) return null;

    return {
      id: data.ID,
      sectorCode: data.SECTOR_CODE,
      center: [data.CENTER_X, data.CENTER_Y, data.CENTER_Z],
      radius: data.RADIUS,
      aestheticTheme: data.AESTHETIC_THEME,
      zoneType: data.ZONE_TYPE,
      nodeCount: data.NODE_COUNT,
      assetCount: data.ASSET_COUNT,
    };
  }

  /**
   * Get all world sectors
   */
  async getAllSectors(): Promise<WorldSector[]> {
    if (!db) return [];

    const { data, error } = await db
      .from('world_sectors')
      .select('*')
      .order('ASSET_COUNT', { ascending: false });

    if (error) return [];

    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.ID as string,
      sectorCode: row.SECTOR_CODE as string,
      center: [row.CENTER_X, row.CENTER_Y, row.CENTER_Z] as [number, number, number],
      radius: row.RADIUS as number,
      aestheticTheme: row.AESTHETIC_THEME as string,
      zoneType: row.ZONE_TYPE as string,
      nodeCount: row.NODE_COUNT as number,
      assetCount: row.ASSET_COUNT as number,
    }));
  }

  /**
   * Clean up on logout/close
   */
  async endPresence(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }

    if (db) {
      await db
        .from('presence_sessions')
        .delete()
        .eq('SESSION_ID', this.sessionId);
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  // ============================================
  // Private Methods
  // ============================================

  private mapRowToAvatar(row: Record<string, unknown>): AvatarState {
    return {
      id: row.ID as string,
      userId: row.USER_ID as string,
      displayName: (row.DISPLAY_NAME as string) || 'Unknown',
      avatarModel: (row.AVATAR_MODEL as string) || 'default_explorer',
      avatarColor: (row.AVATAR_COLOR as string) || '#6366f1',
      lastPosition: (row.LAST_POSITION as [number, number, number]) || [0, 0, 0],
      lastRotation: (row.LAST_ROTATION as [number, number, number, number]) || [0, 0, 0, 1],
      lastSector: (row.LAST_SECTOR as string) || 'ORIGIN',
      contributionLevel: (row.CONTRIBUTION_LEVEL as number) || 1,
      totalNodesCreated: (row.TOTAL_NODES_CREATED as number) || 0,
      totalShardsEarned: parseFloat((row.TOTAL_SHARDS_EARNED as string) || '0'),
      explorationPoints: (row.EXPLORATION_POINTS as number) || 0,
      badges: (row.BADGES as AvatarBadge[]) || [],
      lastSeen: row.LAST_SEEN as string,
    };
  }

  private async sendHeartbeat(): Promise<void> {
    if (!db) return;

    await db
      .from('presence_sessions')
      .update({ HEARTBEAT_AT: new Date().toISOString() })
      .eq('SESSION_ID', this.sessionId);
  }

  private setupIdleDetection(): void {
    const setActive = () => {
      if (this.idleTimeout) {
        clearTimeout(this.idleTimeout);
      }

      // Mark as active
      this.updatePresenceStatus('ACTIVE');

      // Set idle after 2 minutes of inactivity
      this.idleTimeout = setTimeout(() => {
        this.updatePresenceStatus('IDLE');
      }, 120000);
    };

    // Listen for user activity
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', setActive);
      window.addEventListener('keydown', setActive);
      window.addEventListener('scroll', setActive);
      window.addEventListener('click', setActive);
    }

    setActive();
  }

  private async updatePresenceStatus(status: 'ACTIVE' | 'IDLE' | 'AWAY'): Promise<void> {
    if (!db) return;

    await db
      .from('presence_sessions')
      .update({ STATUS: status })
      .eq('SESSION_ID', this.sessionId);
  }
}

// Export singleton instance
export const avatarService = new AvatarService();

// Export for cleanup on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    avatarService.endPresence();
  });
}
