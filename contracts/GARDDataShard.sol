// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title GARDDataShard
 * @notice ERC1155 contract for fractional data asset ownership with royalty recycling
 * @dev Implements the SocialReturnSystem (GARD) tokenomics for GeoGraph Node
 * 
 * Key Features:
 * - Fractional ownership via 1000 shards per asset
 * - 10% royalty on all secondary sales
 * - Automatic distribution: 50% Community, 30% Holders, 20% Maintenance
 * - Genesis asset premium pricing (1.5x multiplier)
 * - On-chain reward claiming for shard holders
 */
contract GARDDataShard is ERC1155, Ownable, ReentrancyGuard {
    using Counters for Counters.Counter;
    
    // ============================================
    // Constants
    // ============================================
    
    uint256 public constant ROYALTY_RATE_BPS = 1000;        // 10% in basis points
    uint256 public constant SHARDS_PER_ASSET = 1000;        // 1000 fractions per NFT
    uint256 public constant COMMUNITY_ALLOCATION_BPS = 5000; // 50%
    uint256 public constant HOLDER_ALLOCATION_BPS = 3000;    // 30%
    uint256 public constant MAINTENANCE_ALLOCATION_BPS = 2000; // 20%
    uint256 public constant GENESIS_MULTIPLIER = 150;        // 1.5x (150/100)
    
    // ============================================
    // State Variables
    // ============================================
    
    Counters.Counter private _tokenIdCounter;
    
    // Treasury addresses
    address public communityFund;
    address public maintenanceFund;
    
    // Asset metadata
    struct DataAsset {
        string assetId;           // GeoGraph ASSET_ID
        address originalCreator;
        uint256 basePrice;        // In wei
        uint256 totalShards;
        uint256 circulatingShards;
        bool isGenesisAsset;      // NFTx1-NFTx5 equivalent
        uint256 createdAt;
        uint256 totalRoyaltiesGenerated;
    }
    
    // Mappings
    mapping(uint256 => DataAsset) public dataAssets;
    mapping(uint256 => uint256) public accumulatedRoyalties;
    mapping(uint256 => mapping(address => uint256)) public holderClaimedRoyalties;
    mapping(address => uint256) public pendingRewards;
    mapping(string => uint256) public assetIdToTokenId; // Reverse lookup
    
    // System stats
    uint256 public totalRoyaltiesGenerated;
    uint256 public totalDistributedToHolders;
    uint256 public totalDistributedToCommunity;
    uint256 public totalAssetsTokenized;
    
    // ============================================
    // Events
    // ============================================
    
    event AssetTokenized(
        uint256 indexed tokenId,
        string assetId,
        address indexed creator,
        uint256 totalShards,
        bool isGenesis
    );
    
    event RoyaltyDistributed(
        uint256 indexed tokenId,
        uint256 totalRoyalty,
        uint256 toCommunity,
        uint256 toHolders,
        uint256 toMaintenance
    );
    
    event ShardTraded(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 price
    );
    
    event RewardsClaimed(
        address indexed holder,
        uint256 amount
    );
    
    event FundsUpdated(
        address newCommunityFund,
        address newMaintenanceFund
    );

    // ============================================
    // Constructor
    // ============================================
    
    constructor(
        address _communityFund,
        address _maintenanceFund
    ) ERC1155("https://api.geograph.foundation/gard/metadata/{id}.json") {
        require(_communityFund != address(0), "Invalid community fund");
        require(_maintenanceFund != address(0), "Invalid maintenance fund");
        
        communityFund = _communityFund;
        maintenanceFund = _maintenanceFund;
    }

    // ============================================
    // Core Functions
    // ============================================
    
    /**
     * @notice Tokenize a data asset into fractional shards
     * @param assetId The GeoGraph ASSET_ID
     * @param basePrice Initial price per shard in wei
     * @param isGenesis Whether this is a genesis (rare) asset
     * @return tokenId The minted token ID
     */
    function tokenizeDataAsset(
        string memory assetId,
        uint256 basePrice,
        bool isGenesis
    ) external returns (uint256 tokenId) {
        require(bytes(assetId).length > 0, "Asset ID required");
        require(assetIdToTokenId[assetId] == 0, "Asset already tokenized");
        require(basePrice > 0, "Price must be positive");
        
        _tokenIdCounter.increment();
        tokenId = _tokenIdCounter.current();
        
        dataAssets[tokenId] = DataAsset({
            assetId: assetId,
            originalCreator: msg.sender,
            basePrice: basePrice,
            totalShards: SHARDS_PER_ASSET,
            circulatingShards: SHARDS_PER_ASSET,
            isGenesisAsset: isGenesis,
            createdAt: block.timestamp,
            totalRoyaltiesGenerated: 0
        });
        
        assetIdToTokenId[assetId] = tokenId;
        totalAssetsTokenized++;
        
        // Mint all shards to creator initially
        _mint(msg.sender, tokenId, SHARDS_PER_ASSET, "");
        
        emit AssetTokenized(tokenId, assetId, msg.sender, SHARDS_PER_ASSET, isGenesis);
        return tokenId;
    }

    /**
     * @notice Process a royalty payment for a transaction
     * @param tokenId The token being traded
     * @dev Called by marketplace contracts or directly with payment
     */
    function distributeRoyalty(uint256 tokenId) external payable nonReentrant {
        require(msg.value > 0, "No royalty to distribute");
        require(dataAssets[tokenId].createdAt > 0, "Asset does not exist");
        
        uint256 toCommunity = (msg.value * COMMUNITY_ALLOCATION_BPS) / 10000;
        uint256 toMaintenance = (msg.value * MAINTENANCE_ALLOCATION_BPS) / 10000;
        uint256 toHolders = msg.value - toCommunity - toMaintenance;
        
        // Transfer to treasury funds
        (bool successCommunity, ) = payable(communityFund).call{value: toCommunity}("");
        require(successCommunity, "Community transfer failed");
        
        (bool successMaintenance, ) = payable(maintenanceFund).call{value: toMaintenance}("");
        require(successMaintenance, "Maintenance transfer failed");
        
        // Accumulate for shard holders
        accumulatedRoyalties[tokenId] += toHolders;
        
        // Update stats
        totalRoyaltiesGenerated += msg.value;
        totalDistributedToCommunity += toCommunity;
        dataAssets[tokenId].totalRoyaltiesGenerated += msg.value;
        
        emit RoyaltyDistributed(
            tokenId,
            msg.value,
            toCommunity,
            toHolders,
            toMaintenance
        );
    }

    /**
     * @notice Claim accumulated rewards for a specific token
     * @param tokenId The token to claim rewards for
     */
    function claimHolderRewards(uint256 tokenId) external nonReentrant {
        uint256 holderBalance = balanceOf(msg.sender, tokenId);
        require(holderBalance > 0, "No shards held");
        
        DataAsset memory asset = dataAssets[tokenId];
        require(asset.createdAt > 0, "Asset does not exist");
        
        uint256 totalRoyalties = accumulatedRoyalties[tokenId];
        uint256 alreadyClaimed = holderClaimedRoyalties[tokenId][msg.sender];
        
        // Pro-rata distribution based on shard ownership
        uint256 totalOwed = (totalRoyalties * holderBalance) / asset.totalShards;
        uint256 claimable = totalOwed - alreadyClaimed;
        
        require(claimable > 0, "No rewards to claim");
        
        holderClaimedRoyalties[tokenId][msg.sender] = totalOwed;
        pendingRewards[msg.sender] += claimable;
    }

    /**
     * @notice Withdraw all pending rewards
     */
    function withdrawRewards() external nonReentrant {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No rewards to withdraw");
        
        pendingRewards[msg.sender] = 0;
        totalDistributedToHolders += amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdrawal failed");
        
        emit RewardsClaimed(msg.sender, amount);
    }

    // ============================================
    // View Functions
    // ============================================
    
    /**
     * @notice Get the price multiplier for an asset
     * @param tokenId The token to check
     * @return multiplier The price multiplier (100 = 1x, 150 = 1.5x)
     */
    function getAssetMultiplier(uint256 tokenId) public view returns (uint256) {
        if (dataAssets[tokenId].isGenesisAsset) {
            return GENESIS_MULTIPLIER;
        }
        return 100;
    }

    /**
     * @notice Calculate current shard price including genesis premium
     * @param tokenId The token to price
     * @return price The current price per shard
     */
    function getCurrentShardPrice(uint256 tokenId) public view returns (uint256) {
        DataAsset memory asset = dataAssets[tokenId];
        uint256 multiplier = getAssetMultiplier(tokenId);
        return (asset.basePrice * multiplier) / 100;
    }

    /**
     * @notice Calculate claimable rewards for a holder
     * @param tokenId The token to check
     * @param holder The address to check
     * @return claimable The amount that can be claimed
     */
    function getClaimableRewards(uint256 tokenId, address holder) external view returns (uint256) {
        uint256 holderBalance = balanceOf(holder, tokenId);
        if (holderBalance == 0) return 0;
        
        DataAsset memory asset = dataAssets[tokenId];
        if (asset.createdAt == 0) return 0;
        
        uint256 totalRoyalties = accumulatedRoyalties[tokenId];
        uint256 alreadyClaimed = holderClaimedRoyalties[tokenId][holder];
        
        uint256 totalOwed = (totalRoyalties * holderBalance) / asset.totalShards;
        return totalOwed > alreadyClaimed ? totalOwed - alreadyClaimed : 0;
    }

    /**
     * @notice Get system statistics
     * @return stats Array of key metrics
     */
    function getSystemStats() external view returns (
        uint256 _totalRoyalties,
        uint256 _distributedToHolders,
        uint256 _distributedToCommunity,
        uint256 _assetsTokenized
    ) {
        return (
            totalRoyaltiesGenerated,
            totalDistributedToHolders,
            totalDistributedToCommunity,
            totalAssetsTokenized
        );
    }

    /**
     * @notice Check if system is self-sustaining
     * @param monthlyNeeds The monthly operational needs in wei
     * @return isSustainable Whether royalty generation exceeds needs
     * @return ratio The generation to needs ratio (100 = break-even)
     */
    function checkSustainability(uint256 monthlyNeeds) external view returns (
        bool isSustainable,
        uint256 ratio
    ) {
        if (monthlyNeeds == 0) {
            return (true, type(uint256).max);
        }
        
        // Simplified: use total royalties as proxy for monthly generation
        // In production, this would track 30-day rolling average
        ratio = (totalRoyaltiesGenerated * 100) / monthlyNeeds;
        isSustainable = ratio >= 100;
    }

    // ============================================
    // Admin Functions
    // ============================================
    
    /**
     * @notice Update treasury fund addresses
     * @param _communityFund New community fund address
     * @param _maintenanceFund New maintenance fund address
     */
    function updateFundAddresses(
        address _communityFund,
        address _maintenanceFund
    ) external onlyOwner {
        require(_communityFund != address(0), "Invalid community fund");
        require(_maintenanceFund != address(0), "Invalid maintenance fund");
        
        communityFund = _communityFund;
        maintenanceFund = _maintenanceFund;
        
        emit FundsUpdated(_communityFund, _maintenanceFund);
    }

    /**
     * @notice Update metadata URI
     * @param newUri The new base URI
     */
    function setURI(string memory newUri) external onlyOwner {
        _setURI(newUri);
    }

    // ============================================
    // ERC1155 Overrides
    // ============================================
    
    /**
     * @notice Hook called before any token transfer
     * @dev Used to track shard circulation
     */
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
        
        // Emit trade event for marketplace tracking
        for (uint256 i = 0; i < ids.length; i++) {
            if (from != address(0) && to != address(0)) {
                emit ShardTraded(ids[i], from, to, amounts[i], 0);
            }
        }
    }

    /**
     * @notice Support for ERC2981 royalty standard
     * @param tokenId The token being queried
     * @param salePrice The sale price
     * @return receiver The royalty receiver (this contract)
     * @return royaltyAmount The royalty amount
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount) {
        require(dataAssets[tokenId].createdAt > 0, "Asset does not exist");
        return (address(this), (salePrice * ROYALTY_RATE_BPS) / 10000);
    }

    /**
     * @notice Check interface support
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        // ERC2981 interface ID
        return interfaceId == 0x2a55205a || super.supportsInterface(interfaceId);
    }

    // Allow contract to receive ETH for royalties
    receive() external payable {}
}
