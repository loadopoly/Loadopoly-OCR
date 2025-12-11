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

// Helper to check for wallet
const getProvider = () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.ethereum) {
        // @ts-ignore
        return new ethers.BrowserProvider(window.ethereum);
    }
    return null;
};

export const triggerMintShards = async (assetId: string, userId: string, walletAddress: string) => {
    const response = await fetch('/api/mint-shards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, userId, walletAddress })
    });
    return await response.json();
};

export const checkShardBalance = async (walletAddress: string, assetId: string) => {
    const provider = getProvider();
    if (!provider) return 0; 

    try {
        const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, provider);
        // In real deploy, query `shards()` from DCC1 to get address
        return Math.floor(Math.random() * 250); // Mock
    } catch (e) {
        console.warn("Web3 check failed, returning mock", e);
        return 0;
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const provider = getProvider();
    if (!provider) throw new Error("No wallet connected. Please connect MetaMask or similar.");

    // Request account access if needed
    // @ts-ignore
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, signer);
    
    // Asset ID string to BigInt hash
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    // Simulate transaction for demo since we can't really call a non-existent contract on localhost
    // const tx = await dcc1.redeemForNFT(numericAssetId);
    // await tx.wait();
    
    // Simulating delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
};