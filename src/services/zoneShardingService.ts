/**
 * Dynamic Zone Sharding Service for 3D Metaverse
 * 
 * Partitions the metaverse into voxel-based zones governed by micro-DAOs.
 * Integrates with The Graph subgraph for on-chain event streaming and
 * decentralized asset fetching from IPFS.
 * 
 * @module zoneShardingService
 */

import { ethers } from 'ethers';
import { logger } from '../lib/logger';
import { MetaverseZone, ZoneType, VisualTheme, DataAsset, GraphNode, GraphEdge } from '../types';

// Zone Configuration
const ZONE_CONFIG = {
  VOXEL_SIZE: 100, // meters per voxel
  MAX_ZONE_DEPTH: 8,
  MIN_ZONE_SIZE: 10,
  MAX_ASSETS_PER_ZONE: 500,
  MICRO_DAO_THRESHOLD: 10, // Minimum GARD holders to form micro-DAO
  PRESENCE_BROADCAST_INTERVAL_MS: 5000,
  ZONE_CACHE_TTL_MS: 300000, // 5 minutes
  GRAPH_POLLING_INTERVAL_MS: 10000,
};

// The Graph Subgraph Endpoint
const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/loadopoly/gard-metaverse';

/**
 * 3D Voxel coordinate
 */
export interface VoxelCoord {
  x: number;
  y: number;
  z: number;
}

/**
 * Zone boundary definition
 */
export interface ZoneBoundary {
  min: VoxelCoord;
  max: VoxelCoord;
  center: VoxelCoord;
  volume: number;
}

/**
 * Zone shard with governance
 */
export interface ZoneShard {
  zoneId: string;
  boundary: ZoneBoundary;
  type: ZoneType;
  theme: VisualTheme;
  assetCount: number;
  ipfsCids: string[];
  microDAO: MicroDAO | null;
  lastUpdated: number;
  onChainVersion: number;
}

/**
 * Micro-DAO for zone governance
 */
export interface MicroDAO {
  daoId: string;
  zoneId: string;
  holderCount: number;
  totalStaked: bigint;
  votingPower: Map<string, number>;
  proposals: DAOProposal[];
  treasury: bigint;
}

/**
 * DAO proposal for zone updates
 */
export interface DAOProposal {
  proposalId: string;
  proposer: string;
  type: 'theme_change' | 'asset_curation' | 'zone_merge' | 'zone_split' | 'royalty_adjustment';
  description: string;
  votesFor: bigint;
  votesAgainst: bigint;
  deadline: number;
  executed: boolean;
  payload: any;
}

/**
 * Zone presence for WebRTC
 */
export interface ZonePresence {
  peerId: string;
  address: string;
  position: VoxelCoord;
  zoneId: string;
  avatar?: string;
  timestamp: number;
}

/**
 * Story path for navigation rewards
 */
export interface StoryPath {
  pathId: string;
  startZone: string;
  endZone: string;
  waypoints: VoxelCoord[];
  unlockedInsights: TokenizedInsight[];
  totalDistance: number;
  completionReward: bigint;
}

/**
 * Tokenized insight from exploration
 */
export interface TokenizedInsight {
  insightId: string;
  zoneId: string;
  assetId: string;
  type: 'connection' | 'pattern' | 'anomaly' | 'story_branch';
  content: string;
  royaltyValue: bigint;
  discoverer: string;
}

/**
 * Subgraph query result types
 */
interface SubgraphZoneEvent {
  id: string;
  zoneId: string;
  eventType: string;
  data: string;
  timestamp: string;
  blockNumber: string;
}

interface SubgraphQueryResult {
  zoneEvents: SubgraphZoneEvent[];
}

/**
 * Zone Sharding Service
 */
class ZoneShardingService {
  private zones: Map<string, ZoneShard> = new Map();
  private presenceMap: Map<string, ZonePresence[]> = new Map();
  private storyPaths: Map<string, StoryPath> = new Map();
  private webRTCConnections: Map<string, RTCPeerConnection> = new Map();
  private provider: ethers.BrowserProvider | null = null;
  private subgraphPolling: NodeJS.Timeout | null = null;
  private lastSubgraphBlock = 0;

  /**
   * Initialize zone sharding service
   */
  async initialize(provider?: ethers.BrowserProvider): Promise<boolean> {
    try {
      this.provider = provider || null;
      
      // Start subgraph polling for on-chain events
      this.startSubgraphPolling();
      
      // Initialize presence broadcasting
      this.initializePresenceBroadcast();

      logger.info('Zone Sharding Service initialized');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Zone Sharding Service', { error });
      return false;
    }
  }

  /**
   * Convert world coordinates to voxel coordinates
   */
  worldToVoxel(worldX: number, worldY: number, worldZ: number): VoxelCoord {
    return {
      x: Math.floor(worldX / ZONE_CONFIG.VOXEL_SIZE),
      y: Math.floor(worldY / ZONE_CONFIG.VOXEL_SIZE),
      z: Math.floor(worldZ / ZONE_CONFIG.VOXEL_SIZE),
    };
  }

  /**
   * Convert voxel coordinates to world coordinates (center of voxel)
   */
  voxelToWorld(voxel: VoxelCoord): { x: number; y: number; z: number } {
    return {
      x: (voxel.x + 0.5) * ZONE_CONFIG.VOXEL_SIZE,
      y: (voxel.y + 0.5) * ZONE_CONFIG.VOXEL_SIZE,
      z: (voxel.z + 0.5) * ZONE_CONFIG.VOXEL_SIZE,
    };
  }

  /**
   * Generate zone ID from voxel coordinates
   */
  generateZoneId(voxel: VoxelCoord, depth: number = 0): string {
    return `zone_${voxel.x}_${voxel.y}_${voxel.z}_d${depth}`;
  }

  /**
   * Create or get zone for a position
   */
  async getOrCreateZone(
    worldPos: { x: number; y: number; z: number },
    type?: ZoneType,
    theme?: VisualTheme
  ): Promise<ZoneShard> {
    const voxel = this.worldToVoxel(worldPos.x, worldPos.y, worldPos.z);
    const zoneId = this.generateZoneId(voxel);

    // Check cache
    const cached = this.zones.get(zoneId);
    if (cached && Date.now() - cached.lastUpdated < ZONE_CONFIG.ZONE_CACHE_TTL_MS) {
      return cached;
    }

    // Create new zone
    const zone: ZoneShard = {
      zoneId,
      boundary: this.calculateZoneBoundary(voxel),
      type: type || this.inferZoneType(voxel),
      theme: theme || this.inferVisualTheme(voxel),
      assetCount: 0,
      ipfsCids: [],
      microDAO: null,
      lastUpdated: Date.now(),
      onChainVersion: 0,
    };

    this.zones.set(zoneId, zone);

    // Fetch zone data from subgraph
    await this.syncZoneFromSubgraph(zone);

    return zone;
  }

  /**
   * Calculate zone boundary from voxel
   */
  private calculateZoneBoundary(voxel: VoxelCoord): ZoneBoundary {
    const min: VoxelCoord = { ...voxel };
    const max: VoxelCoord = {
      x: voxel.x + 1,
      y: voxel.y + 1,
      z: voxel.z + 1,
    };
    const center: VoxelCoord = {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    };
    const volume = ZONE_CONFIG.VOXEL_SIZE ** 3;

    return { min, max, center, volume };
  }

  /**
   * Infer zone type from coordinates
   */
  private inferZoneType(voxel: VoxelCoord): ZoneType {
    // Use spatial hashing to determine zone type
    const hash = (voxel.x * 31 + voxel.y * 17 + voxel.z * 13) % 5;
    const types: ZoneType[] = [
      'URBAN', 'RURAL', 'WILDERNESS', 'HISTORICAL', 'INDUSTRIAL'
    ];
    return types[hash];
  }

  /**
   * Infer visual theme from coordinates
   */
  private inferVisualTheme(voxel: VoxelCoord): VisualTheme {
    const hash = (voxel.x * 7 + voxel.y * 11 + voxel.z * 23) % 4;
    const themes: VisualTheme[] = [
      'CLASSIC', 'DENSE', 'SCHEMATIC', 'ABSTRACT'
    ];
    return themes[hash];
  }

  /**
   * Sync zone data from The Graph subgraph
   */
  private async syncZoneFromSubgraph(zone: ZoneShard): Promise<void> {
    try {
      const query = `
        query GetZoneData($zoneId: String!) {
          zoneEvents(
            where: { zoneId: $zoneId }
            orderBy: timestamp
            orderDirection: desc
            first: 100
          ) {
            id
            zoneId
            eventType
            data
            timestamp
            blockNumber
          }
        }
      `;

      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { zoneId: zone.zoneId },
        }),
      });

      const result = await response.json();
      const events: SubgraphZoneEvent[] = result.data?.zoneEvents || [];

      // Process events to update zone state
      for (const event of events) {
        this.processZoneEvent(zone, event);
      }

      if (events.length > 0) {
        zone.onChainVersion = parseInt(events[0].blockNumber);
      }
    } catch (error) {
      logger.warn('Failed to sync zone from subgraph', { 
        zoneId: zone.zoneId, 
        error 
      });
    }
  }

  /**
   * Process zone event from subgraph
   */
  private processZoneEvent(zone: ZoneShard, event: SubgraphZoneEvent): void {
    const data = JSON.parse(event.data);

    switch (event.eventType) {
      case 'ASSET_ADDED':
        zone.assetCount++;
        if (data.ipfsCid && !zone.ipfsCids.includes(data.ipfsCid)) {
          zone.ipfsCids.push(data.ipfsCid);
        }
        break;

      case 'ASSET_REMOVED':
        zone.assetCount = Math.max(0, zone.assetCount - 1);
        break;

      case 'MICRO_DAO_FORMED':
        zone.microDAO = {
          daoId: data.daoId,
          zoneId: zone.zoneId,
          holderCount: data.holderCount,
          totalStaked: BigInt(data.totalStaked),
          votingPower: new Map(Object.entries(data.votingPower)),
          proposals: [],
          treasury: BigInt(data.treasury || '0'),
        };
        break;

      case 'PROPOSAL_CREATED':
        if (zone.microDAO) {
          zone.microDAO.proposals.push({
            proposalId: data.proposalId,
            proposer: data.proposer,
            type: data.type,
            description: data.description,
            votesFor: BigInt(0),
            votesAgainst: BigInt(0),
            deadline: data.deadline,
            executed: false,
            payload: data.payload,
          });
        }
        break;

      case 'THEME_CHANGED':
        zone.theme = data.newTheme;
        break;
    }

    zone.lastUpdated = parseInt(event.timestamp) * 1000;
  }

  /**
   * Start polling subgraph for updates
   */
  private startSubgraphPolling(): void {
    this.subgraphPolling = setInterval(async () => {
      await this.pollSubgraphForUpdates();
    }, ZONE_CONFIG.GRAPH_POLLING_INTERVAL_MS);
  }

  /**
   * Poll subgraph for new events
   */
  private async pollSubgraphForUpdates(): Promise<void> {
    try {
      const query = `
        query GetRecentEvents($lastBlock: Int!) {
          zoneEvents(
            where: { blockNumber_gt: $lastBlock }
            orderBy: blockNumber
            orderDirection: asc
            first: 100
          ) {
            id
            zoneId
            eventType
            data
            timestamp
            blockNumber
          }
        }
      `;

      const response = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { lastBlock: this.lastSubgraphBlock },
        }),
      });

      const result = await response.json();
      const events: SubgraphZoneEvent[] = result.data?.zoneEvents || [];

      for (const event of events) {
        const zone = this.zones.get(event.zoneId);
        if (zone) {
          this.processZoneEvent(zone, event);
        }
        this.lastSubgraphBlock = Math.max(
          this.lastSubgraphBlock,
          parseInt(event.blockNumber)
        );
      }
    } catch (error) {
      logger.warn('Failed to poll subgraph', { error });
    }
  }

  /**
   * Initialize presence broadcast system
   */
  private initializePresenceBroadcast(): void {
    // Presence is handled by WebRTC signaling
    // This would integrate with your existing realtime WebRTC system
  }

  /**
   * Update user presence in zone
   */
  async updatePresence(presence: ZonePresence): Promise<void> {
    const zonePresences = this.presenceMap.get(presence.zoneId) || [];
    
    // Remove old presence for this peer
    const filtered = zonePresences.filter(p => p.peerId !== presence.peerId);
    filtered.push(presence);
    
    this.presenceMap.set(presence.zoneId, filtered);

    // Clean up stale presences
    const now = Date.now();
    const active = filtered.filter(
      p => now - p.timestamp < ZONE_CONFIG.PRESENCE_BROADCAST_INTERVAL_MS * 3
    );
    this.presenceMap.set(presence.zoneId, active);
  }

  /**
   * Get all presences in a zone
   */
  getZonePresences(zoneId: string): ZonePresence[] {
    return this.presenceMap.get(zoneId) || [];
  }

  /**
   * Get zones visible from a position
   */
  getVisibleZones(
    position: VoxelCoord,
    viewDistance: number = 3
  ): ZoneShard[] {
    const visible: ZoneShard[] = [];

    for (let dx = -viewDistance; dx <= viewDistance; dx++) {
      for (let dy = -viewDistance; dy <= viewDistance; dy++) {
        for (let dz = -viewDistance; dz <= viewDistance; dz++) {
          const voxel: VoxelCoord = {
            x: position.x + dx,
            y: position.y + dy,
            z: position.z + dz,
          };
          const zoneId = this.generateZoneId(voxel);
          const zone = this.zones.get(zoneId);
          if (zone) {
            visible.push(zone);
          }
        }
      }
    }

    return visible;
  }

  /**
   * Fetch zone assets from IPFS
   */
  async fetchZoneAssets(zone: ZoneShard): Promise<DataAsset[]> {
    const assets: DataAsset[] = [];

    for (const cid of zone.ipfsCids) {
      try {
        const response = await fetch(`https://ipfs.io/ipfs/${cid}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          assets.push(...data);
        } else if (data.assets) {
          assets.push(...data.assets);
        }
      } catch (error) {
        logger.warn('Failed to fetch zone assets from IPFS', { cid, error });
      }
    }

    return assets.slice(0, ZONE_CONFIG.MAX_ASSETS_PER_ZONE);
  }

  /**
   * Create story path between zones
   */
  createStoryPath(
    startZone: string,
    endZone: string,
    waypoints: VoxelCoord[]
  ): StoryPath {
    const pathId = `path_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // Calculate total distance
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dx = waypoints[i + 1].x - waypoints[i].x;
      const dy = waypoints[i + 1].y - waypoints[i].y;
      const dz = waypoints[i + 1].z - waypoints[i].z;
      totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz) * ZONE_CONFIG.VOXEL_SIZE;
    }

    const path: StoryPath = {
      pathId,
      startZone,
      endZone,
      waypoints,
      unlockedInsights: [],
      totalDistance,
      completionReward: BigInt(Math.floor(totalDistance / 100)), // 1 wei per 100m
    };

    this.storyPaths.set(pathId, path);

    logger.info('Story path created', {
      pathId,
      startZone,
      endZone,
      waypointCount: waypoints.length,
      totalDistance,
    });

    return path;
  }

  /**
   * Unlock insight during exploration
   */
  unlockInsight(
    pathId: string,
    zoneId: string,
    assetId: string,
    type: TokenizedInsight['type'],
    content: string,
    discoverer: string
  ): TokenizedInsight | null {
    const path = this.storyPaths.get(pathId);
    if (!path) return null;

    const insight: TokenizedInsight = {
      insightId: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      zoneId,
      assetId,
      type,
      content,
      royaltyValue: BigInt(ethers.parseUnits('0.001', 'ether')),
      discoverer,
    };

    path.unlockedInsights.push(insight);

    logger.info('Insight unlocked', {
      insightId: insight.insightId,
      pathId,
      type,
    });

    return insight;
  }

  /**
   * Form micro-DAO for a zone
   */
  async formMicroDAO(
    zoneId: string,
    holders: { address: string; stake: bigint }[]
  ): Promise<MicroDAO | null> {
    if (holders.length < ZONE_CONFIG.MICRO_DAO_THRESHOLD) {
      logger.warn('Not enough holders to form micro-DAO', {
        zoneId,
        holderCount: holders.length,
        required: ZONE_CONFIG.MICRO_DAO_THRESHOLD,
      });
      return null;
    }

    const zone = this.zones.get(zoneId);
    if (!zone) return null;

    const totalStaked = holders.reduce((sum, h) => sum + h.stake, BigInt(0));
    const votingPower = new Map(
      holders.map(h => [h.address, Number(h.stake * BigInt(100) / totalStaked) / 100])
    );

    const microDAO: MicroDAO = {
      daoId: `dao_${zoneId}_${Date.now()}`,
      zoneId,
      holderCount: holders.length,
      totalStaked,
      votingPower,
      proposals: [],
      treasury: BigInt(0),
    };

    zone.microDAO = microDAO;

    logger.info('Micro-DAO formed', {
      daoId: microDAO.daoId,
      zoneId,
      holderCount: holders.length,
      totalStaked: totalStaked.toString(),
    });

    return microDAO;
  }

  /**
   * Create proposal in micro-DAO
   */
  createProposal(
    zoneId: string,
    proposer: string,
    type: DAOProposal['type'],
    description: string,
    payload: any,
    durationMs: number = 86400000 // 24 hours
  ): DAOProposal | null {
    const zone = this.zones.get(zoneId);
    if (!zone?.microDAO) return null;

    const proposal: DAOProposal = {
      proposalId: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      proposer,
      type,
      description,
      votesFor: BigInt(0),
      votesAgainst: BigInt(0),
      deadline: Date.now() + durationMs,
      executed: false,
      payload,
    };

    zone.microDAO.proposals.push(proposal);

    logger.info('Proposal created', {
      proposalId: proposal.proposalId,
      zoneId,
      type,
    });

    return proposal;
  }

  /**
   * Vote on proposal
   */
  voteOnProposal(
    zoneId: string,
    proposalId: string,
    voter: string,
    support: boolean
  ): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone?.microDAO) return false;

    const proposal = zone.microDAO.proposals.find(p => p.proposalId === proposalId);
    if (!proposal || proposal.executed || Date.now() > proposal.deadline) {
      return false;
    }

    const votingPower = zone.microDAO.votingPower.get(voter);
    if (!votingPower) return false;

    const voteWeight = BigInt(Math.floor(votingPower * 1e18));

    if (support) {
      proposal.votesFor += voteWeight;
    } else {
      proposal.votesAgainst += voteWeight;
    }

    logger.info('Vote recorded', {
      proposalId,
      voter,
      support,
      voteWeight: voteWeight.toString(),
    });

    return true;
  }

  /**
   * Get zone statistics
   */
  getStats(): {
    totalZones: number;
    activeZones: number;
    totalAssets: number;
    microDAOCount: number;
    activePresences: number;
  } {
    let totalAssets = 0;
    let microDAOCount = 0;
    let activePresences = 0;

    for (const zone of this.zones.values()) {
      totalAssets += zone.assetCount;
      if (zone.microDAO) microDAOCount++;
    }

    for (const presences of this.presenceMap.values()) {
      activePresences += presences.length;
    }

    return {
      totalZones: this.zones.size,
      activeZones: this.presenceMap.size,
      totalAssets,
      microDAOCount,
      activePresences,
    };
  }

  /**
   * Cleanup and stop polling
   */
  cleanup(): void {
    if (this.subgraphPolling) {
      clearInterval(this.subgraphPolling);
      this.subgraphPolling = null;
    }

    for (const connection of this.webRTCConnections.values()) {
      connection.close();
    }
    this.webRTCConnections.clear();

    logger.info('Zone Sharding Service cleaned up');
  }
}

// Export singleton
export const zoneShardingService = new ZoneShardingService();

/**
 * Plugin adapter for zone sharding
 */
export const createZoneShardingPlugin = () => ({
  id: 'zone-sharding',
  name: 'Dynamic 3D Zone Sharding',
  version: '1.0.0',

  async initialize(provider?: ethers.BrowserProvider) {
    return zoneShardingService.initialize(provider);
  },

  async getZone(position: { x: number; y: number; z: number }) {
    return zoneShardingService.getOrCreateZone(position);
  },

  updatePresence(presence: ZonePresence) {
    return zoneShardingService.updatePresence(presence);
  },

  getVisibleZones(position: VoxelCoord, viewDistance?: number) {
    return zoneShardingService.getVisibleZones(position, viewDistance);
  },

  cleanup() {
    zoneShardingService.cleanup();
  },
});

export default zoneShardingService;
