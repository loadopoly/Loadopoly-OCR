/**
 * useAvatar Hook
 * 
 * React hook for managing avatar state, presence tracking,
 * and multi-user awareness in the metaverse layer.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  avatarService, 
  AvatarState, 
  PresenceState, 
  WorldSector 
} from '../services/avatarService';

interface UseAvatarReturn {
  avatar: AvatarState | null;
  nearbyUsers: PresenceState[];
  currentSector: WorldSector | null;
  isLoading: boolean;
  isOnline: boolean;
  
  // Actions
  updatePosition: (
    position: [number, number, number],
    rotation: [number, number, number, number],
    sector?: string
  ) => Promise<void>;
  changeSector: (sectorCode: string) => Promise<void>;
  updateSettings: (settings: {
    displayName?: string;
    avatarModel?: string;
    avatarColor?: string;
  }) => Promise<boolean>;
  awardPoints: (points: number) => Promise<number>;
}

export function useAvatar(userId: string | null): UseAvatarReturn {
  const [avatar, setAvatar] = useState<AvatarState | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<PresenceState[]>([]);
  const [currentSector, setCurrentSector] = useState<WorldSector | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const positionUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPositionRef = useRef<[number, number, number]>([0, 0, 0]);

  // Initialize avatar on login
  useEffect(() => {
    if (!userId) {
      setAvatar(null);
      setIsLoading(false);
      setIsOnline(false);
      return;
    }

    setIsLoading(true);
    
    avatarService.initializeAvatar(userId).then(async (avatarData) => {
      setAvatar(avatarData);
      
      if (avatarData) {
        // Get initial sector info
        const sector = await avatarService.getSector(avatarData.lastSector);
        setCurrentSector(sector);
        
        // Start presence tracking
        await avatarService.startPresence(
          userId, 
          avatarData.lastSector,
          avatarData.lastPosition
        );
        setIsOnline(true);
        
        lastPositionRef.current = avatarData.lastPosition;
      }
      
      setIsLoading(false);
    });

    // Cleanup on unmount or user change
    return () => {
      avatarService.endPresence();
      setIsOnline(false);
      
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [userId]);

  // Subscribe to sector presence
  useEffect(() => {
    if (!userId || !currentSector) return;

    // Unsubscribe from previous sector
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // Subscribe to current sector
    unsubscribeRef.current = avatarService.subscribeSectorPresence(
      currentSector.sectorCode,
      (presence) => {
        // Filter out self
        setNearbyUsers(presence.filter(p => p.userId !== userId));
      }
    );

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [userId, currentSector?.sectorCode]);

  // Debounced position update
  const updatePosition = useCallback(
    async (
      position: [number, number, number],
      rotation: [number, number, number, number],
      sector?: string
    ) => {
      if (!userId || !avatar) return;

      // Debounce position updates (max once per 100ms)
      if (positionUpdateTimeoutRef.current) {
        clearTimeout(positionUpdateTimeoutRef.current);
      }

      positionUpdateTimeoutRef.current = setTimeout(async () => {
        const targetSector = sector || avatar.lastSector;
        
        // Update presence immediately (fast)
        await avatarService.updatePresencePosition(position, targetSector);
        
        // Update avatar state (debounced, less frequent)
        lastPositionRef.current = position;
        
        // Persist to database every second at most
        await avatarService.savePosition(userId, position, rotation, targetSector);
        
        setAvatar(prev => prev ? {
          ...prev,
          lastPosition: position,
          lastRotation: rotation,
          lastSector: targetSector,
        } : null);
      }, 100);
    },
    [userId, avatar]
  );

  // Change sector
  const changeSector = useCallback(
    async (sectorCode: string) => {
      if (!userId || !avatar) return;

      // Get new sector info
      const sector = await avatarService.getSector(sectorCode);
      if (!sector) {
        console.warn(`Sector ${sectorCode} not found`);
        return;
      }

      // Update presence to new sector
      await avatarService.updatePresencePosition(
        lastPositionRef.current,
        sectorCode
      );

      // Award exploration points for visiting new sector
      if (avatar.lastSector !== sectorCode) {
        await avatarService.awardExplorationPoints(userId, 10);
      }

      // Update local state
      setCurrentSector(sector);
      setAvatar(prev => prev ? { ...prev, lastSector: sectorCode } : null);
    },
    [userId, avatar]
  );

  // Update avatar settings
  const updateSettings = useCallback(
    async (settings: {
      displayName?: string;
      avatarModel?: string;
      avatarColor?: string;
    }) => {
      if (!userId) return false;

      const success = await avatarService.updateAvatarSettings(userId, settings);
      
      if (success) {
        setAvatar(prev => prev ? { ...prev, ...settings } : null);
      }
      
      return success;
    },
    [userId]
  );

  // Award exploration points
  const awardPoints = useCallback(
    async (points: number) => {
      if (!userId) return 0;
      
      const newTotal = await avatarService.awardExplorationPoints(userId, points);
      
      setAvatar(prev => prev ? { ...prev, explorationPoints: newTotal } : null);
      
      return newTotal;
    },
    [userId]
  );

  return {
    avatar,
    nearbyUsers,
    currentSector,
    isLoading,
    isOnline,
    updatePosition,
    changeSector,
    updateSettings,
    awardPoints,
  };
}

// ============================================
// Additional Hooks
// ============================================

/**
 * Hook for fetching all world sectors
 */
export function useWorldSectors() {
  const [sectors, setSectors] = useState<WorldSector[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    avatarService.getAllSectors().then((data) => {
      setSectors(data);
      setIsLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const data = await avatarService.getAllSectors();
    setSectors(data);
    setIsLoading(false);
  }, []);

  return { sectors, isLoading, refresh };
}

/**
 * Hook for tracking contribution progress
 */
export function useContributionProgress(avatar: AvatarState | null) {
  const [progress, setProgress] = useState({
    level: 1,
    currentXP: 0,
    nextLevelXP: 100,
    percentToNext: 0,
  });

  useEffect(() => {
    if (!avatar) return;

    const level = avatar.contributionLevel;
    const totalNodes = avatar.totalNodesCreated;
    
    // Logarithmic XP curve
    const currentLevelThreshold = Math.pow(2, level - 1);
    const nextLevelThreshold = Math.pow(2, level);
    const xpInCurrentLevel = totalNodes - currentLevelThreshold;
    const xpNeededForLevel = nextLevelThreshold - currentLevelThreshold;
    
    setProgress({
      level,
      currentXP: xpInCurrentLevel,
      nextLevelXP: xpNeededForLevel,
      percentToNext: Math.min(100, (xpInCurrentLevel / xpNeededForLevel) * 100),
    });
  }, [avatar?.contributionLevel, avatar?.totalNodesCreated]);

  return progress;
}
