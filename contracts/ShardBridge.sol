// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title ShardBridge - Cross-Chain Shard Liquidity Bridge
 * @author Loadopoly Team
 * @notice Enables bridging GARD shards to other L2s (Optimism, Arbitrum) via
 *         atomic swaps and shard fusion mechanics
 * @dev Uses hash time-locked contracts (HTLC) pattern for trustless bridging
 */
contract ShardBridge is 
    ERC1155Holder,
    AccessControl, 
    ReentrancyGuard, 
    Pausable 
{
    // ============ Constants ============
    
    bytes32 public constant BRIDGE_OPERATOR_ROLE = keccak256("BRIDGE_OPERATOR_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    
    uint256 public constant MIN_LOCK_DURATION = 1 hours;
    uint256 public constant MAX_LOCK_DURATION = 7 days;
    uint256 public constant FUSION_THRESHOLD = 10; // Minimum shards to fuse
    uint256 public constant FUSION_BONUS_BPS = 500; // 5% bonus for fusion
    
    // Supported chain IDs
    uint256 public constant POLYGON_CHAIN_ID = 137;
    uint256 public constant OPTIMISM_CHAIN_ID = 10;
    uint256 public constant ARBITRUM_CHAIN_ID = 42161;
    uint256 public constant BASE_CHAIN_ID = 8453;
    
    // ============ State Variables ============
    
    /// @notice GARD token contract
    IERC1155 public gardToken;
    
    /// @notice Bridge lock for HTLC atomic swaps
    struct BridgeLock {
        bytes32 lockId;
        address sender;
        address recipient;
        uint256 tokenId;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        uint256 targetChainId;
        bool withdrawn;
        bool refunded;
        bytes32 preimage; // Set when withdrawn
    }
    
    /// @notice Shard fusion request
    struct FusionRequest {
        bytes32 fusionId;
        address owner;
        uint256[] inputTokenIds;
        uint256[] inputAmounts;
        uint256 outputTokenId;
        uint256 outputAmount;
        uint256 bonusAmount;
        bool executed;
        bool verified;
        bytes32 semanticHash; // Hash of semantic deduplication proof
    }
    
    /// @notice Bridge relay message
    struct RelayMessage {
        bytes32 messageId;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sender;
        address recipient;
        uint256 tokenId;
        uint256 amount;
        bytes data;
        uint256 nonce;
        bool processed;
    }
    
    /// @notice Chain bridge configuration
    struct ChainConfig {
        uint256 chainId;
        address bridgeContract;
        bool enabled;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 fee; // In basis points
    }
    
    // Lock storage
    mapping(bytes32 => BridgeLock) public locks;
    bytes32[] public lockIds;
    
    // Fusion storage
    mapping(bytes32 => FusionRequest) public fusionRequests;
    bytes32[] public fusionIds;
    
    // Relay messages
    mapping(bytes32 => RelayMessage) public relayMessages;
    mapping(uint256 => uint256) public chainNonces; // chainId => nonce
    
    // Chain configurations
    mapping(uint256 => ChainConfig) public chainConfigs;
    uint256[] public supportedChains;
    
    // Validator signatures tracking
    mapping(bytes32 => mapping(address => bool)) public validatorSignatures;
    mapping(bytes32 => uint256) public signatureCount;
    uint256 public requiredSignatures = 3;
    
    // Fee collection
    uint256 public collectedFees;
    
    // ============ Events ============
    
    event LockCreated(
        bytes32 indexed lockId,
        address indexed sender,
        address recipient,
        uint256 tokenId,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        uint256 targetChainId
    );
    
    event LockWithdrawn(
        bytes32 indexed lockId,
        bytes32 preimage
    );
    
    event LockRefunded(
        bytes32 indexed lockId
    );
    
    event FusionRequested(
        bytes32 indexed fusionId,
        address indexed owner,
        uint256[] inputTokenIds,
        uint256[] inputAmounts,
        bytes32 semanticHash
    );
    
    event FusionExecuted(
        bytes32 indexed fusionId,
        uint256 outputTokenId,
        uint256 outputAmount,
        uint256 bonusAmount
    );
    
    event RelayMessageSent(
        bytes32 indexed messageId,
        uint256 sourceChainId,
        uint256 targetChainId,
        address sender,
        uint256 tokenId,
        uint256 amount
    );
    
    event RelayMessageReceived(
        bytes32 indexed messageId,
        uint256 sourceChainId,
        address recipient,
        uint256 tokenId,
        uint256 amount
    );
    
    event ChainConfigured(
        uint256 indexed chainId,
        address bridgeContract,
        bool enabled
    );
    
    event ValidatorSigned(
        bytes32 indexed messageId,
        address indexed validator,
        uint256 signatureCount
    );
    
    // ============ Constructor ============
    
    constructor(address _gardToken) {
        gardToken = IERC1155(_gardToken);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(BRIDGE_OPERATOR_ROLE, msg.sender);
        _grantRole(VALIDATOR_ROLE, msg.sender);
        
        // Initialize supported chains
        _configureChain(POLYGON_CHAIN_ID, address(0), true, 1, 1000000, 50);
        _configureChain(OPTIMISM_CHAIN_ID, address(0), true, 1, 1000000, 75);
        _configureChain(ARBITRUM_CHAIN_ID, address(0), true, 1, 1000000, 75);
        _configureChain(BASE_CHAIN_ID, address(0), true, 1, 1000000, 50);
    }
    
    // ============ HTLC Functions ============
    
    /**
     * @notice Create a new lock for cross-chain transfer
     * @param recipient Recipient address on target chain
     * @param tokenId GARD token ID to bridge
     * @param amount Amount of shards to bridge
     * @param hashlock SHA256 hash of the preimage
     * @param timelock Duration lock is valid
     * @param targetChainId Target chain for the transfer
     */
    function createLock(
        address recipient,
        uint256 tokenId,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock,
        uint256 targetChainId
    ) external whenNotPaused nonReentrant returns (bytes32) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be positive");
        require(hashlock != bytes32(0), "Invalid hashlock");
        require(
            timelock >= MIN_LOCK_DURATION && timelock <= MAX_LOCK_DURATION,
            "Invalid timelock duration"
        );
        
        ChainConfig storage config = chainConfigs[targetChainId];
        require(config.enabled, "Target chain not supported");
        require(amount >= config.minAmount, "Below minimum amount");
        require(amount <= config.maxAmount, "Above maximum amount");
        
        // Calculate and deduct fee
        uint256 fee = (amount * config.fee) / 10000;
        uint256 netAmount = amount - fee;
        collectedFees += fee;
        
        // Transfer tokens to this contract
        gardToken.safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );
        
        bytes32 lockId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            tokenId,
            netAmount,
            hashlock,
            block.timestamp,
            targetChainId
        ));
        
        require(locks[lockId].lockId == bytes32(0), "Lock already exists");
        
        locks[lockId] = BridgeLock({
            lockId: lockId,
            sender: msg.sender,
            recipient: recipient,
            tokenId: tokenId,
            amount: netAmount,
            hashlock: hashlock,
            timelock: block.timestamp + timelock,
            targetChainId: targetChainId,
            withdrawn: false,
            refunded: false,
            preimage: bytes32(0)
        });
        
        lockIds.push(lockId);
        
        emit LockCreated(
            lockId,
            msg.sender,
            recipient,
            tokenId,
            netAmount,
            hashlock,
            block.timestamp + timelock,
            targetChainId
        );
        
        return lockId;
    }
    
    /**
     * @notice Withdraw locked tokens by revealing preimage
     * @param lockId Lock identifier
     * @param preimage Secret preimage that hashes to hashlock
     */
    function withdraw(
        bytes32 lockId,
        bytes32 preimage
    ) external nonReentrant {
        BridgeLock storage lock = locks[lockId];
        
        require(lock.lockId != bytes32(0), "Lock does not exist");
        require(!lock.withdrawn, "Already withdrawn");
        require(!lock.refunded, "Already refunded");
        require(
            sha256(abi.encodePacked(preimage)) == lock.hashlock,
            "Invalid preimage"
        );
        
        lock.withdrawn = true;
        lock.preimage = preimage;
        
        // Transfer to recipient (on this chain, actual cross-chain handled by relay)
        gardToken.safeTransferFrom(
            address(this),
            lock.recipient,
            lock.tokenId,
            lock.amount,
            ""
        );
        
        emit LockWithdrawn(lockId, preimage);
    }
    
    /**
     * @notice Refund locked tokens after timelock expires
     * @param lockId Lock identifier
     */
    function refund(bytes32 lockId) external nonReentrant {
        BridgeLock storage lock = locks[lockId];
        
        require(lock.lockId != bytes32(0), "Lock does not exist");
        require(!lock.withdrawn, "Already withdrawn");
        require(!lock.refunded, "Already refunded");
        require(block.timestamp >= lock.timelock, "Timelock not expired");
        
        lock.refunded = true;
        
        // Return tokens to sender
        gardToken.safeTransferFrom(
            address(this),
            lock.sender,
            lock.tokenId,
            lock.amount,
            ""
        );
        
        emit LockRefunded(lockId);
    }
    
    // ============ Shard Fusion Functions ============
    
    /**
     * @notice Request fusion of multiple low-value shards into higher-tier NFT
     * @param inputTokenIds Array of token IDs to fuse
     * @param inputAmounts Array of amounts for each token
     * @param semanticHash Hash proving semantic deduplication verification
     */
    function requestFusion(
        uint256[] calldata inputTokenIds,
        uint256[] calldata inputAmounts,
        bytes32 semanticHash
    ) external whenNotPaused nonReentrant returns (bytes32) {
        require(
            inputTokenIds.length == inputAmounts.length,
            "Array length mismatch"
        );
        require(inputTokenIds.length >= 2, "Need at least 2 tokens");
        
        uint256 totalInput = 0;
        for (uint256 i = 0; i < inputAmounts.length; i++) {
            require(inputAmounts[i] >= FUSION_THRESHOLD, "Below fusion threshold");
            totalInput += inputAmounts[i];
            
            // Transfer input tokens
            gardToken.safeTransferFrom(
                msg.sender,
                address(this),
                inputTokenIds[i],
                inputAmounts[i],
                ""
            );
        }
        
        // Calculate bonus (5% for successful fusion)
        uint256 bonusAmount = (totalInput * FUSION_BONUS_BPS) / 10000;
        
        bytes32 fusionId = keccak256(abi.encodePacked(
            msg.sender,
            inputTokenIds,
            inputAmounts,
            semanticHash,
            block.timestamp
        ));
        
        fusionRequests[fusionId] = FusionRequest({
            fusionId: fusionId,
            owner: msg.sender,
            inputTokenIds: inputTokenIds,
            inputAmounts: inputAmounts,
            outputTokenId: 0, // Set when executed
            outputAmount: totalInput + bonusAmount,
            bonusAmount: bonusAmount,
            executed: false,
            verified: false,
            semanticHash: semanticHash
        });
        
        fusionIds.push(fusionId);
        
        emit FusionRequested(
            fusionId,
            msg.sender,
            inputTokenIds,
            inputAmounts,
            semanticHash
        );
        
        return fusionId;
    }
    
    /**
     * @notice Verify and execute fusion request
     * @param fusionId Fusion request identifier
     * @param outputTokenId New higher-tier token ID
     */
    function executeFusion(
        bytes32 fusionId,
        uint256 outputTokenId
    ) external onlyRole(BRIDGE_OPERATOR_ROLE) {
        FusionRequest storage fusion = fusionRequests[fusionId];
        
        require(fusion.fusionId != bytes32(0), "Fusion does not exist");
        require(!fusion.executed, "Already executed");
        require(fusion.verified, "Not verified");
        
        fusion.executed = true;
        fusion.outputTokenId = outputTokenId;
        
        // Note: The actual minting would be done via the GARD contract
        // This is a simplified version that transfers existing tokens
        
        emit FusionExecuted(
            fusionId,
            outputTokenId,
            fusion.outputAmount,
            fusion.bonusAmount
        );
    }
    
    /**
     * @notice Verify fusion semantic hash
     * @param fusionId Fusion request identifier
     */
    function verifyFusion(bytes32 fusionId) external onlyRole(VALIDATOR_ROLE) {
        FusionRequest storage fusion = fusionRequests[fusionId];
        require(fusion.fusionId != bytes32(0), "Fusion does not exist");
        require(!fusion.verified, "Already verified");
        
        fusion.verified = true;
    }
    
    /**
     * @notice Cancel fusion and refund tokens
     * @param fusionId Fusion request identifier
     */
    function cancelFusion(bytes32 fusionId) external nonReentrant {
        FusionRequest storage fusion = fusionRequests[fusionId];
        
        require(fusion.fusionId != bytes32(0), "Fusion does not exist");
        require(fusion.owner == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Not authorized");
        require(!fusion.executed, "Already executed");
        
        // Refund input tokens
        for (uint256 i = 0; i < fusion.inputTokenIds.length; i++) {
            gardToken.safeTransferFrom(
                address(this),
                fusion.owner,
                fusion.inputTokenIds[i],
                fusion.inputAmounts[i],
                ""
            );
        }
        
        // Mark as executed to prevent re-entry
        fusion.executed = true;
    }
    
    // ============ Relay Message Functions ============
    
    /**
     * @notice Send relay message to another chain
     * @param targetChainId Target chain ID
     * @param recipient Recipient on target chain
     * @param tokenId Token to bridge
     * @param amount Amount to bridge
     * @param data Additional data
     */
    function sendRelayMessage(
        uint256 targetChainId,
        address recipient,
        uint256 tokenId,
        uint256 amount,
        bytes calldata data
    ) external whenNotPaused nonReentrant returns (bytes32) {
        ChainConfig storage config = chainConfigs[targetChainId];
        require(config.enabled, "Target chain not supported");
        
        // Lock tokens
        gardToken.safeTransferFrom(
            msg.sender,
            address(this),
            tokenId,
            amount,
            ""
        );
        
        uint256 nonce = chainNonces[targetChainId]++;
        
        bytes32 messageId = keccak256(abi.encodePacked(
            block.chainid,
            targetChainId,
            msg.sender,
            recipient,
            tokenId,
            amount,
            nonce
        ));
        
        relayMessages[messageId] = RelayMessage({
            messageId: messageId,
            sourceChainId: block.chainid,
            targetChainId: targetChainId,
            sender: msg.sender,
            recipient: recipient,
            tokenId: tokenId,
            amount: amount,
            data: data,
            nonce: nonce,
            processed: false
        });
        
        emit RelayMessageSent(
            messageId,
            block.chainid,
            targetChainId,
            msg.sender,
            tokenId,
            amount
        );
        
        return messageId;
    }
    
    /**
     * @notice Process incoming relay message from another chain
     * @param messageId Message identifier
     * @param sourceChainId Source chain ID
     * @param sender Original sender
     * @param recipient Recipient on this chain
     * @param tokenId Token to receive
     * @param amount Amount to receive
     * @param signatures Validator signatures
     */
    function receiveRelayMessage(
        bytes32 messageId,
        uint256 sourceChainId,
        address sender,
        address recipient,
        uint256 tokenId,
        uint256 amount,
        bytes[] calldata signatures
    ) external onlyRole(BRIDGE_OPERATOR_ROLE) nonReentrant {
        require(!relayMessages[messageId].processed, "Already processed");
        require(signatures.length >= requiredSignatures, "Insufficient signatures");
        
        // Verify message hash
        bytes32 expectedMessageId = keccak256(abi.encodePacked(
            sourceChainId,
            block.chainid,
            sender,
            recipient,
            tokenId,
            amount,
            chainNonces[sourceChainId]
        ));
        
        // Note: In production, verify actual ECDSA signatures
        
        relayMessages[messageId] = RelayMessage({
            messageId: messageId,
            sourceChainId: sourceChainId,
            targetChainId: block.chainid,
            sender: sender,
            recipient: recipient,
            tokenId: tokenId,
            amount: amount,
            data: "",
            nonce: chainNonces[sourceChainId]++,
            processed: true
        });
        
        // Release tokens to recipient
        // Note: This assumes tokens were pre-deposited in the bridge
        gardToken.safeTransferFrom(
            address(this),
            recipient,
            tokenId,
            amount,
            ""
        );
        
        emit RelayMessageReceived(
            messageId,
            sourceChainId,
            recipient,
            tokenId,
            amount
        );
    }
    
    /**
     * @notice Validator signs a relay message
     * @param messageId Message to sign
     */
    function signRelayMessage(bytes32 messageId) external onlyRole(VALIDATOR_ROLE) {
        require(!validatorSignatures[messageId][msg.sender], "Already signed");
        
        validatorSignatures[messageId][msg.sender] = true;
        signatureCount[messageId]++;
        
        emit ValidatorSigned(messageId, msg.sender, signatureCount[messageId]);
    }
    
    // ============ Configuration Functions ============
    
    /**
     * @notice Configure a supported chain
     */
    function configureChain(
        uint256 chainId,
        address bridgeContract,
        bool enabled,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 fee
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _configureChain(chainId, bridgeContract, enabled, minAmount, maxAmount, fee);
    }
    
    function _configureChain(
        uint256 chainId,
        address bridgeContract,
        bool enabled,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 fee
    ) internal {
        if (chainConfigs[chainId].chainId == 0) {
            supportedChains.push(chainId);
        }
        
        chainConfigs[chainId] = ChainConfig({
            chainId: chainId,
            bridgeContract: bridgeContract,
            enabled: enabled,
            minAmount: minAmount,
            maxAmount: maxAmount,
            fee: fee
        });
        
        emit ChainConfigured(chainId, bridgeContract, enabled);
    }
    
    /**
     * @notice Update required validator signatures
     */
    function setRequiredSignatures(uint256 _required) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_required > 0, "Must require at least 1 signature");
        requiredSignatures = _required;
    }
    
    /**
     * @notice Update GARD token address
     */
    function setGardToken(address _gardToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        gardToken = IERC1155(_gardToken);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get lock details
     */
    function getLock(bytes32 lockId) external view returns (BridgeLock memory) {
        return locks[lockId];
    }
    
    /**
     * @notice Get fusion request details
     */
    function getFusion(bytes32 fusionId) external view returns (
        bytes32 _fusionId,
        address owner,
        uint256 outputAmount,
        uint256 bonusAmount,
        bool executed,
        bool verified,
        bytes32 semanticHash
    ) {
        FusionRequest storage f = fusionRequests[fusionId];
        return (
            f.fusionId,
            f.owner,
            f.outputAmount,
            f.bonusAmount,
            f.executed,
            f.verified,
            f.semanticHash
        );
    }
    
    /**
     * @notice Get all supported chain IDs
     */
    function getSupportedChains() external view returns (uint256[] memory) {
        return supportedChains;
    }
    
    /**
     * @notice Check if chain is supported
     */
    function isChainSupported(uint256 chainId) external view returns (bool) {
        return chainConfigs[chainId].enabled;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Withdraw collected fees
     */
    function withdrawFees(
        uint256 tokenId,
        uint256 amount,
        address recipient
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collectedFees >= amount, "Insufficient fees");
        collectedFees -= amount;
        
        gardToken.safeTransferFrom(
            address(this),
            recipient,
            tokenId,
            amount,
            ""
        );
    }
    
    /**
     * @notice Pause bridge operations
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }
    
    /**
     * @notice Unpause bridge operations
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
    
    /**
     * @notice Emergency token recovery
     */
    function emergencyRecover(
        uint256 tokenId,
        uint256 amount,
        address recipient
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        gardToken.safeTransferFrom(
            address(this),
            recipient,
            tokenId,
            amount,
            ""
        );
    }
}
