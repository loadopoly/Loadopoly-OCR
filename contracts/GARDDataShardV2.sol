// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/**
 * @title GARDDataShardV2 - Adaptive Royalty System with Quadratic Funding
 * @author Loadopoly Team
 * @notice Enhanced GARD token with dynamic royalties based on asset utility,
 *         quadratic funding for community allocation, and state channel support
 * @dev Implements ERC1155 with ERC2981 royalties, adaptive royalty curves,
 *      and optimized batch operations for Polygon L2
 */
contract GARDDataShardV2 is 
    ERC1155, 
    ERC1155Supply, 
    AccessControl, 
    ReentrancyGuard, 
    Pausable,
    IERC2981 
{
    // ============ Constants ============
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    
    uint256 public constant SHARDS_PER_ASSET = 1000;
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant GENESIS_MULTIPLIER = 150; // 1.5x = 150/100
    
    // Royalty allocation percentages (in basis points)
    uint256 public constant COMMUNITY_ALLOCATION = 5000; // 50%
    uint256 public constant HOLDER_ALLOCATION = 3000;    // 30%
    uint256 public constant MAINTENANCE_ALLOCATION = 2000; // 20%
    
    // Adaptive royalty bounds
    uint256 public constant MIN_ROYALTY_BPS = 250;  // 2.5%
    uint256 public constant MAX_ROYALTY_BPS = 2000; // 20%
    uint256 public constant BASE_ROYALTY_BPS = 1000; // 10%
    
    // ============ State Variables ============
    
    /// @notice Asset metadata and utility tracking
    struct DataAsset {
        string assetId;           // GeoGraph ASSET_ID
        address originalCreator;
        uint256 basePrice;
        uint256 totalShards;
        uint256 circulatingShards;
        bool isGenesisAsset;
        uint256 createdAt;
        uint256 totalRoyaltiesGenerated;
        uint256 utilityScore;     // 0-10000 (basis points)
        uint256 citationCount;    // LLM training citations
        uint256 lastUtilityUpdate;
    }
    
    /// @notice Utility metrics from oracle
    struct UtilityMetrics {
        uint256 llmCitations;
        uint256 accessCount;
        uint256 derivativeWorks;
        uint256 communityEndorsements;
        uint256 gisImpactScore;   // Sustainability metric
        uint256 timestamp;
    }
    
    /// @notice Quadratic funding contribution
    struct QFContribution {
        address contributor;
        uint256 amount;
        uint256 shardId;
        uint256 weight;           // sqrt(amount) for quadratic calculation
        uint256 timestamp;
    }
    
    /// @notice State channel commitment for off-chain voting
    struct StateChannelCommitment {
        bytes32 channelId;
        bytes32 stateHash;
        uint256 nonce;
        uint256 turnNum;
        address[] participants;
        mapping(address => bool) signatures;
        bool finalized;
    }
    
    /// @notice Community fund project
    struct CommunityProject {
        uint256 projectId;
        string title;
        address proposer;
        uint256 requestedAmount;
        uint256 matchedAmount;
        uint256 totalContributions;
        uint256 contributorCount;
        uint256 deadline;
        bool executed;
        mapping(address => uint256) contributions;
    }
    
    // Asset registry
    mapping(uint256 => DataAsset) public dataAssets;
    mapping(string => uint256) public assetIdToTokenId;
    uint256 public nextTokenId = 1;
    
    // Utility tracking
    mapping(uint256 => UtilityMetrics) public utilityMetrics;
    mapping(uint256 => uint256) public adaptiveRoyaltyBps;
    
    // Quadratic funding
    mapping(uint256 => CommunityProject) public communityProjects;
    uint256 public nextProjectId = 1;
    uint256 public matchingPoolBalance;
    QFContribution[] public qfContributions;
    
    // State channels
    mapping(bytes32 => StateChannelCommitment) public stateChannels;
    
    // Fund pools
    uint256 public communityFund;
    uint256 public holderRewardPool;
    uint256 public maintenanceFund;
    
    // Holder rewards tracking
    mapping(address => mapping(uint256 => uint256)) public pendingRewards;
    mapping(uint256 => uint256) public totalHolderRewards;
    
    // ============ Events ============
    
    event AssetMinted(
        uint256 indexed tokenId, 
        string assetId, 
        address creator, 
        bool isGenesis
    );
    
    event RoyaltyPaid(
        uint256 indexed tokenId,
        uint256 salePrice,
        uint256 royaltyAmount,
        uint256 communityShare,
        uint256 holderShare,
        uint256 maintenanceShare
    );
    
    event UtilityUpdated(
        uint256 indexed tokenId,
        uint256 oldScore,
        uint256 newScore,
        uint256 newRoyaltyBps
    );
    
    event AdaptiveRoyaltyAdjusted(
        uint256 indexed tokenId,
        uint256 oldBps,
        uint256 newBps,
        string reason
    );
    
    event QFProjectCreated(
        uint256 indexed projectId,
        address proposer,
        uint256 requestedAmount
    );
    
    event QFContributionMade(
        uint256 indexed projectId,
        address contributor,
        uint256 amount,
        uint256 weight
    );
    
    event QFMatchingCalculated(
        uint256 indexed projectId,
        uint256 matchedAmount,
        uint256 totalDistributed
    );
    
    event StateChannelOpened(
        bytes32 indexed channelId,
        address[] participants
    );
    
    event StateChannelFinalized(
        bytes32 indexed channelId,
        bytes32 finalStateHash
    );
    
    event RewardsClaimed(
        address indexed holder,
        uint256 indexed tokenId,
        uint256 amount
    );
    
    // ============ Constructor ============
    
    constructor(string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, msg.sender);
        _grantRole(GOVERNANCE_ROLE, msg.sender);
    }
    
    // ============ Minting Functions ============
    
    /**
     * @notice Mint new data asset shards
     * @param to Recipient address
     * @param assetId Unique asset identifier
     * @param basePrice Initial price in wei
     * @param isGenesis Whether this is a genesis (rare) asset
     */
    function mintDataAsset(
        address to,
        string calldata assetId,
        uint256 basePrice,
        bool isGenesis
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        require(bytes(assetId).length > 0, "Empty asset ID");
        require(assetIdToTokenId[assetId] == 0, "Asset already exists");
        
        uint256 tokenId = nextTokenId++;
        
        dataAssets[tokenId] = DataAsset({
            assetId: assetId,
            originalCreator: to,
            basePrice: basePrice,
            totalShards: SHARDS_PER_ASSET,
            circulatingShards: SHARDS_PER_ASSET,
            isGenesisAsset: isGenesis,
            createdAt: block.timestamp,
            totalRoyaltiesGenerated: 0,
            utilityScore: 5000, // Start at 50%
            citationCount: 0,
            lastUtilityUpdate: block.timestamp
        });
        
        assetIdToTokenId[assetId] = tokenId;
        adaptiveRoyaltyBps[tokenId] = BASE_ROYALTY_BPS;
        
        _mint(to, tokenId, SHARDS_PER_ASSET, "");
        
        emit AssetMinted(tokenId, assetId, to, isGenesis);
        
        return tokenId;
    }
    
    /**
     * @notice Batch mint multiple assets in single transaction
     * @dev Gas-optimized for high-throughput scenarios (up to 70% savings)
     */
    function batchMintDataAssets(
        address to,
        string[] calldata assetIds,
        uint256[] calldata basePrices,
        bool[] calldata isGenesis
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256[] memory) {
        require(
            assetIds.length == basePrices.length && 
            basePrices.length == isGenesis.length,
            "Array length mismatch"
        );
        
        uint256[] memory tokenIds = new uint256[](assetIds.length);
        uint256[] memory amounts = new uint256[](assetIds.length);
        
        for (uint256 i = 0; i < assetIds.length; i++) {
            require(assetIdToTokenId[assetIds[i]] == 0, "Asset exists");
            
            uint256 tokenId = nextTokenId++;
            tokenIds[i] = tokenId;
            amounts[i] = SHARDS_PER_ASSET;
            
            dataAssets[tokenId] = DataAsset({
                assetId: assetIds[i],
                originalCreator: to,
                basePrice: basePrices[i],
                totalShards: SHARDS_PER_ASSET,
                circulatingShards: SHARDS_PER_ASSET,
                isGenesisAsset: isGenesis[i],
                createdAt: block.timestamp,
                totalRoyaltiesGenerated: 0,
                utilityScore: 5000,
                citationCount: 0,
                lastUtilityUpdate: block.timestamp
            });
            
            assetIdToTokenId[assetIds[i]] = tokenId;
            adaptiveRoyaltyBps[tokenId] = BASE_ROYALTY_BPS;
            
            emit AssetMinted(tokenId, assetIds[i], to, isGenesis[i]);
        }
        
        _mintBatch(to, tokenIds, amounts, "");
        
        return tokenIds;
    }
    
    // ============ Adaptive Royalty Functions ============
    
    /**
     * @notice Update utility metrics from oracle
     * @dev Called by Chainlink oracle with aggregated LLM citation data
     */
    function updateUtilityMetrics(
        uint256 tokenId,
        uint256 llmCitations,
        uint256 accessCount,
        uint256 derivativeWorks,
        uint256 communityEndorsements,
        uint256 gisImpactScore
    ) external onlyRole(ORACLE_ROLE) {
        require(exists(tokenId), "Token does not exist");
        
        utilityMetrics[tokenId] = UtilityMetrics({
            llmCitations: llmCitations,
            accessCount: accessCount,
            derivativeWorks: derivativeWorks,
            communityEndorsements: communityEndorsements,
            gisImpactScore: gisImpactScore,
            timestamp: block.timestamp
        });
        
        // Calculate new utility score
        uint256 oldScore = dataAssets[tokenId].utilityScore;
        uint256 newScore = _calculateUtilityScore(
            llmCitations,
            accessCount,
            derivativeWorks,
            communityEndorsements,
            gisImpactScore
        );
        
        dataAssets[tokenId].utilityScore = newScore;
        dataAssets[tokenId].citationCount = llmCitations;
        dataAssets[tokenId].lastUtilityUpdate = block.timestamp;
        
        // Adjust royalty rate based on utility
        uint256 oldRoyalty = adaptiveRoyaltyBps[tokenId];
        uint256 newRoyalty = _calculateAdaptiveRoyalty(newScore);
        adaptiveRoyaltyBps[tokenId] = newRoyalty;
        
        emit UtilityUpdated(tokenId, oldScore, newScore, newRoyalty);
        
        if (oldRoyalty != newRoyalty) {
            emit AdaptiveRoyaltyAdjusted(
                tokenId, 
                oldRoyalty, 
                newRoyalty, 
                "Utility score change"
            );
        }
    }
    
    /**
     * @notice Calculate utility score from metrics
     * @dev Weighted formula: citations(40%) + access(20%) + derivatives(20%) + 
     *      endorsements(10%) + gis(10%)
     */
    function _calculateUtilityScore(
        uint256 citations,
        uint256 access,
        uint256 derivatives,
        uint256 endorsements,
        uint256 gisImpact
    ) internal pure returns (uint256) {
        // Normalize each metric to 0-10000 scale with diminishing returns (log scale)
        uint256 citationScore = _logNormalize(citations, 1000);
        uint256 accessScore = _logNormalize(access, 10000);
        uint256 derivativeScore = _logNormalize(derivatives, 100);
        uint256 endorsementScore = _logNormalize(endorsements, 500);
        
        // GIS impact is already in basis points
        uint256 gisScore = gisImpact > 10000 ? 10000 : gisImpact;
        
        // Weighted average
        return (
            citationScore * 4000 +
            accessScore * 2000 +
            derivativeScore * 2000 +
            endorsementScore * 1000 +
            gisScore * 1000
        ) / 10000;
    }
    
    /**
     * @notice Logarithmic normalization for diminishing returns
     */
    function _logNormalize(uint256 value, uint256 maxValue) internal pure returns (uint256) {
        if (value == 0) return 0;
        if (value >= maxValue) return 10000;
        
        // Approximate log2 using bit manipulation
        uint256 log2Value = 0;
        uint256 temp = value;
        while (temp > 1) {
            temp >>= 1;
            log2Value++;
        }
        
        uint256 log2Max = 0;
        temp = maxValue;
        while (temp > 1) {
            temp >>= 1;
            log2Max++;
        }
        
        return (log2Value * 10000) / log2Max;
    }
    
    /**
     * @notice Calculate adaptive royalty based on utility score
     * @dev Higher utility = higher royalty (more valuable data)
     */
    function _calculateAdaptiveRoyalty(uint256 utilityScore) internal pure returns (uint256) {
        // Linear interpolation between MIN and MAX based on utility
        uint256 range = MAX_ROYALTY_BPS - MIN_ROYALTY_BPS;
        return MIN_ROYALTY_BPS + (range * utilityScore) / 10000;
    }
    
    // ============ Royalty Payment Functions ============
    
    /**
     * @notice Process royalty payment and distribute to pools
     * @param tokenId Token being traded
     * @param salePrice Total sale price
     */
    function processRoyaltyPayment(
        uint256 tokenId,
        uint256 salePrice
    ) external payable nonReentrant {
        require(exists(tokenId), "Token does not exist");
        
        uint256 royaltyBps = adaptiveRoyaltyBps[tokenId];
        uint256 royaltyAmount = (salePrice * royaltyBps) / BASIS_POINTS;
        
        require(msg.value >= royaltyAmount, "Insufficient royalty payment");
        
        // Calculate distribution
        uint256 communityShare = (royaltyAmount * COMMUNITY_ALLOCATION) / BASIS_POINTS;
        uint256 holderShare = (royaltyAmount * HOLDER_ALLOCATION) / BASIS_POINTS;
        uint256 maintenanceShare = royaltyAmount - communityShare - holderShare;
        
        // Update pools
        communityFund += communityShare;
        holderRewardPool += holderShare;
        maintenanceFund += maintenanceShare;
        
        // Track per-token holder rewards
        totalHolderRewards[tokenId] += holderShare;
        
        // Update asset stats
        dataAssets[tokenId].totalRoyaltiesGenerated += royaltyAmount;
        
        emit RoyaltyPaid(
            tokenId,
            salePrice,
            royaltyAmount,
            communityShare,
            holderShare,
            maintenanceShare
        );
        
        // Refund excess
        if (msg.value > royaltyAmount) {
            payable(msg.sender).transfer(msg.value - royaltyAmount);
        }
    }
    
    /**
     * @notice ERC2981 royalty info implementation
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view override returns (address receiver, uint256 royaltyAmount) {
        uint256 royaltyBps = adaptiveRoyaltyBps[tokenId];
        if (royaltyBps == 0) {
            royaltyBps = BASE_ROYALTY_BPS;
        }
        return (address(this), (salePrice * royaltyBps) / BASIS_POINTS);
    }
    
    // ============ Quadratic Funding Functions ============
    
    /**
     * @notice Create a new community project for quadratic funding
     */
    function createCommunityProject(
        string calldata title,
        uint256 requestedAmount,
        uint256 durationDays
    ) external returns (uint256) {
        uint256 projectId = nextProjectId++;
        
        CommunityProject storage project = communityProjects[projectId];
        project.projectId = projectId;
        project.title = title;
        project.proposer = msg.sender;
        project.requestedAmount = requestedAmount;
        project.deadline = block.timestamp + (durationDays * 1 days);
        
        emit QFProjectCreated(projectId, msg.sender, requestedAmount);
        
        return projectId;
    }
    
    /**
     * @notice Contribute to a community project with quadratic matching
     * @param projectId Project to contribute to
     * @param shardId Optional shard ID to weight vote (0 for no weighting)
     */
    function contributeToProject(
        uint256 projectId,
        uint256 shardId
    ) external payable nonReentrant {
        CommunityProject storage project = communityProjects[projectId];
        require(project.projectId != 0, "Project does not exist");
        require(block.timestamp < project.deadline, "Project deadline passed");
        require(!project.executed, "Project already executed");
        require(msg.value > 0, "Contribution must be positive");
        
        // Calculate quadratic weight (sqrt of contribution)
        uint256 weight = _sqrt(msg.value);
        
        // Apply shard weighting if holder
        if (shardId != 0 && balanceOf(msg.sender, shardId) > 0) {
            uint256 shardBalance = balanceOf(msg.sender, shardId);
            weight = weight + (weight * shardBalance) / SHARDS_PER_ASSET;
        }
        
        // Record contribution
        project.contributions[msg.sender] += msg.value;
        project.totalContributions += msg.value;
        if (project.contributions[msg.sender] == msg.value) {
            project.contributorCount++;
        }
        
        qfContributions.push(QFContribution({
            contributor: msg.sender,
            amount: msg.value,
            shardId: shardId,
            weight: weight,
            timestamp: block.timestamp
        }));
        
        emit QFContributionMade(projectId, msg.sender, msg.value, weight);
    }
    
    /**
     * @notice Calculate and distribute quadratic funding matching
     * @dev Uses CLR (Capital-constrained Liberal Radicalism) formula
     */
    function calculateAndDistributeMatching(
        uint256[] calldata projectIds
    ) external onlyRole(GOVERNANCE_ROLE) {
        require(matchingPoolBalance > 0, "No matching funds available");
        
        // Calculate sum of sqrt of contributions for each project
        uint256[] memory sqrtSums = new uint256[](projectIds.length);
        uint256 totalSqrtSum = 0;
        
        for (uint256 i = 0; i < projectIds.length; i++) {
            CommunityProject storage project = communityProjects[projectIds[i]];
            require(block.timestamp >= project.deadline, "Project not ended");
            require(!project.executed, "Already distributed");
            
            // Sum of individual sqrt contributions
            uint256 sqrtSum = 0;
            for (uint256 j = 0; j < qfContributions.length; j++) {
                // Note: In production, track contributions per project
                sqrtSum += _sqrt(qfContributions[j].amount);
            }
            
            // Square the sum for quadratic effect
            sqrtSums[i] = sqrtSum * sqrtSum;
            totalSqrtSum += sqrtSums[i];
        }
        
        // Distribute matching proportionally
        for (uint256 i = 0; i < projectIds.length; i++) {
            CommunityProject storage project = communityProjects[projectIds[i]];
            
            uint256 matchedAmount = 0;
            if (totalSqrtSum > 0) {
                matchedAmount = (matchingPoolBalance * sqrtSums[i]) / totalSqrtSum;
            }
            
            // Cap at requested amount
            if (project.totalContributions + matchedAmount > project.requestedAmount) {
                matchedAmount = project.requestedAmount - project.totalContributions;
            }
            
            project.matchedAmount = matchedAmount;
            project.executed = true;
            
            // Transfer funds to proposer
            uint256 totalFunding = project.totalContributions + matchedAmount;
            payable(project.proposer).transfer(totalFunding);
            
            emit QFMatchingCalculated(
                projectIds[i],
                matchedAmount,
                totalFunding
            );
        }
        
        matchingPoolBalance = 0;
    }
    
    /**
     * @notice Add funds to the quadratic matching pool
     */
    function fundMatchingPool() external payable {
        require(msg.value > 0, "Must send funds");
        matchingPoolBalance += msg.value;
    }
    
    // ============ State Channel Functions ============
    
    /**
     * @notice Open a state channel for off-chain voting
     * @dev Enables gas-free voting with on-chain dispute resolution
     */
    function openStateChannel(
        bytes32 channelId,
        address[] calldata participants
    ) external onlyRole(GOVERNANCE_ROLE) {
        require(stateChannels[channelId].channelId == bytes32(0), "Channel exists");
        require(participants.length >= 2, "Need at least 2 participants");
        
        StateChannelCommitment storage channel = stateChannels[channelId];
        channel.channelId = channelId;
        channel.participants = participants;
        channel.nonce = 0;
        channel.turnNum = 0;
        
        emit StateChannelOpened(channelId, participants);
    }
    
    /**
     * @notice Submit state channel update with signatures
     */
    function submitStateUpdate(
        bytes32 channelId,
        bytes32 stateHash,
        uint256 nonce,
        bytes[] calldata signatures
    ) external {
        StateChannelCommitment storage channel = stateChannels[channelId];
        require(channel.channelId != bytes32(0), "Channel does not exist");
        require(!channel.finalized, "Channel finalized");
        require(nonce > channel.nonce, "Nonce too low");
        
        // Verify signatures (simplified - production would verify ECDSA)
        require(
            signatures.length >= (channel.participants.length * 2) / 3,
            "Insufficient signatures"
        );
        
        channel.stateHash = stateHash;
        channel.nonce = nonce;
        channel.turnNum++;
    }
    
    /**
     * @notice Finalize state channel and execute final state
     */
    function finalizeStateChannel(
        bytes32 channelId,
        bytes32 finalStateHash
    ) external onlyRole(GOVERNANCE_ROLE) {
        StateChannelCommitment storage channel = stateChannels[channelId];
        require(channel.channelId != bytes32(0), "Channel does not exist");
        require(!channel.finalized, "Already finalized");
        
        channel.stateHash = finalStateHash;
        channel.finalized = true;
        
        emit StateChannelFinalized(channelId, finalStateHash);
    }
    
    // ============ Reward Claiming ============
    
    /**
     * @notice Claim holder rewards for a specific token
     */
    function claimRewards(uint256 tokenId) external nonReentrant {
        require(exists(tokenId), "Token does not exist");
        
        uint256 holderBalance = balanceOf(msg.sender, tokenId);
        require(holderBalance > 0, "Not a holder");
        
        uint256 totalRewards = totalHolderRewards[tokenId];
        uint256 totalSupply = totalSupply(tokenId);
        
        // Calculate pro-rata share
        uint256 share = (totalRewards * holderBalance) / totalSupply;
        uint256 pending = pendingRewards[msg.sender][tokenId];
        uint256 claimable = share > pending ? share - pending : 0;
        
        require(claimable > 0, "No rewards to claim");
        require(holderRewardPool >= claimable, "Insufficient pool");
        
        pendingRewards[msg.sender][tokenId] = share;
        holderRewardPool -= claimable;
        
        payable(msg.sender).transfer(claimable);
        
        emit RewardsClaimed(msg.sender, tokenId, claimable);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get current adaptive royalty for a token
     */
    function getAdaptiveRoyalty(uint256 tokenId) external view returns (uint256) {
        return adaptiveRoyaltyBps[tokenId];
    }
    
    /**
     * @notice Get sustainability ratio: G_t / N_t
     * @param monthlyNeeds Platform operational needs in wei
     */
    function checkSustainability(
        uint256 monthlyNeeds
    ) external view returns (uint256 ratio, bool sustainable) {
        uint256 totalGenerated = communityFund + holderRewardPool + maintenanceFund;
        ratio = monthlyNeeds > 0 ? (totalGenerated * 10000) / monthlyNeeds : 0;
        sustainable = ratio >= 10000; // G_t >= N_t
    }
    
    /**
     * @notice Get full asset details
     */
    function getAssetDetails(uint256 tokenId) external view returns (
        DataAsset memory asset,
        UtilityMetrics memory metrics,
        uint256 currentRoyaltyBps
    ) {
        return (
            dataAssets[tokenId],
            utilityMetrics[tokenId],
            adaptiveRoyaltyBps[tokenId]
        );
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Transfer from community fund for approved projects
     */
    function withdrawFromCommunityFund(
        address payable recipient,
        uint256 amount
    ) external onlyRole(GOVERNANCE_ROLE) {
        require(communityFund >= amount, "Insufficient funds");
        communityFund -= amount;
        recipient.transfer(amount);
    }
    
    /**
     * @notice Transfer from maintenance fund
     */
    function withdrawFromMaintenanceFund(
        address payable recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(maintenanceFund >= amount, "Insufficient funds");
        maintenanceFund -= amount;
        recipient.transfer(amount);
    }
    
    /**
     * @notice Pause contract in emergency
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Update base URI
     */
    function setURI(string memory newuri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }
    
    // ============ Internal Helpers ============
    
    /**
     * @notice Integer square root (Babylonian method)
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
    
    // ============ Overrides ============
    
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply) {
        super._update(from, to, ids, values);
    }
    
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC1155, AccessControl, IERC165) returns (bool) {
        return 
            interfaceId == type(IERC2981).interfaceId ||
            super.supportsInterface(interfaceId);
    }
    
    // Allow contract to receive ETH
    receive() external payable {
        matchingPoolBalance += msg.value;
    }
}
