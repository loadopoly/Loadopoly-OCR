import { ethers } from 'ethers';

// Configuration
const DCC1_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d89A21"; // Mock address
const DCC1_ABI = [
  "function mintShards(address to, uint256 assetId) external",
  "function redeemForNFT(uint256 assetId) external",
  "function redeemPhysicalItem(uint256 tokenId) external",
  "function shards(uint256 id) view returns (address)",
  "function certificate(uint256 id) view returns (address)",
  "event ShardsMinted(address to, uint256 assetId, uint256 amount)",
  "event NFTClaimed(address to, uint256 tokenId, uint256 assetId)"
];

declare global {
  interface Window {
    ethereum: any;
  }
}

export const getProvider = () => {
  if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No crypto wallet detected');
  }
  return new ethers.BrowserProvider(window.ethereum);
};

export const connectWallet = async () => {
  const provider = getProvider();
  await provider.send('eth_requestAccounts', []);
  return await provider.getSigner();
};

export const triggerMintShards = async (assetId: string, userId: string, walletAddress: string) => {
    // Note: In a real app this might sign a message or call a contract
    // Here we hit the API endpoint as per previous structure
    const response = await fetch('/api/mint-shards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, userId, walletAddress })
    });
    return await response.json();
};

export const checkShardBalance = async (walletAddress: string, assetId: string) => {
    try {
        if (!window.ethereum) return 0;
        const provider = new ethers.BrowserProvider(window.ethereum);
        // Mocking return
        return Math.floor(Math.random() * 250); 
    } catch (err) {
        console.warn("Web3 check failed, returning mock", err);
        return 0;
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const provider = getProvider();
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    
    // Asset ID string to BigInt hash
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return mock tx hash
    return "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
};

export default ethers;