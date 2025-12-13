import { ethers } from 'ethers';

// Configuration
// Using a placeholder address for now. In production, this would be an ENV variable.
const DCC1_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d89A21"; 

// ABI for the Shard Contract (ERC-1155 derivative)
const DCC1_ABI = [
  "function mintShards(address to, uint256 assetId) external",
  "function redeemForNFT(uint256 assetId) external",
  "function redeemPhysicalItem(uint256 tokenId) external",
  "function shards(uint256 id) view returns (address)",
  "function certificate(uint256 id) view returns (address)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "event ShardsMinted(address to, uint256 assetId, uint256 amount)",
  "event NFTClaimed(address to, uint256 tokenId, uint256 assetId)"
];

// EIP-6963 Provider Info
interface EIP6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: any;
}

declare global {
  interface Window {
    ethereum: any;
  }
}

// 1. Connection Management
export const connectWallet = async () => {
  if (typeof window === 'undefined') return null;

  // Prefer window.ethereum (MetaMask, Coinbase Wallet Extension, etc.)
  if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        // Force permission request
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        const network = await provider.getNetwork();
        
        return {
            provider,
            signer,
            address,
            chainId: network.chainId
        };
      } catch (e) {
          console.error("Wallet connection failed:", e);
          throw new Error("Failed to connect wallet.");
      }
  } else {
      throw new Error("No crypto wallet found. Please install MetaMask, Coinbase Wallet, or Rabby.");
  }
};

export const switchNetworkToPolygon = async (provider: ethers.BrowserProvider) => {
    // Polygon Mainnet Chain ID
    const chainId = '0x89'; 
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId }]);
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to the wallet.
      if (switchError.code === 4902) {
        await provider.send('wallet_addEthereumChain', [{
          chainId,
          chainName: 'Polygon Mainnet',
          rpcUrls: ['https://polygon-rpc.com/'],
          blockExplorerUrls: ['https://polygonscan.com/'],
          nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }
        }]);
      } else {
        throw switchError;
      }
    }
};

// 2. Real Contract Interactions (No Simulation)
export const mintShardClientSide = async (assetId: string) => {
    // Connect & Validate
    const wallet = await connectWallet();
    if (!wallet) throw new Error("Wallet not connected");

    // Ensure Network (Polygon)
    if (wallet.chainId !== 137n) {
        await switchNetworkToPolygon(wallet.provider);
    }

    const contract = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, wallet.signer);
    
    // Hash Asset ID for Solidity (uint256)
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    try {
        console.log(`Minting shards for Asset ${assetId} (Hash: ${numericAssetId}) on Polygon...`);
        
        // Send Transaction
        const tx = await contract.mintShards(wallet.address, numericAssetId);
        
        // Wait for confirmation
        const receipt = await tx.wait(1);
        
        if (receipt.status !== 1) {
            throw new Error("Transaction reverted by EVM.");
        }

        // Return real data derived from the transaction
        return {
            txHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            assetId: assetId,
            numericId: numericAssetId.toString(),
            contractAddress: DCC1_ADDRESS,
            owner: wallet.address
        };
    } catch (err: any) {
        // Handle User Rejection
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
            throw new Error("Transaction rejected by user.");
        }
        console.error("Minting Contract Error:", err);
        throw new Error(err.reason || err.message || "Minting failed on-chain.");
    }
};

// Fetch real balance from chain
export const getShardBalance = async (assetId: string, userAddress: string) => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, provider);
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));
    try {
        const balance = await contract.balanceOf(userAddress, numericAssetId);
        return balance.toString();
    } catch (e) {
        console.warn("Failed to fetch balance, defaulting to 0", e);
        return "0";
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const wallet = await connectWallet();
    if (!wallet) throw new Error("Wallet not connected");

    const contract = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, wallet.signer);
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    const tx = await contract.redeemForNFT(numericAssetId);
    const receipt = await tx.wait(1);
    
    return receipt.hash;
};

export default {};