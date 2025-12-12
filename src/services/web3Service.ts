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

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum: any;
  }
}

export const getProvider = () => {
  if (typeof window !== 'undefined' && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
  }
  return null;
};

export const connectWallet = async () => {
  if (typeof window !== 'undefined' && window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        return accounts[0]; 
      } catch (e) {
          console.error("Wallet connection error:", e);
          return null;
      }
  }
  console.warn("No wallet detected");
  return null;
};

export const triggerMintShards = async (assetId: string, userId: string, walletAddress: string) => {
    // Hit the API endpoint which handles the private key and ethers logic server-side
    try {
        const response = await fetch('/api/mint-shards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assetId, userId, walletAddress })
        });
        return await response.json();
    } catch (e) {
        console.error("Mint API error:", e);
        return { success: false, error: "API unreachable" };
    }
};

export const checkShardBalance = async (walletAddress: string, assetId: string) => {
    try {
        const provider = getProvider();
        if (!provider) return Math.floor(Math.random() * 250); // Fallback mock
        
        // Example real implementation:
        // const contract = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, await provider.getSigner());
        // const balance = await contract.balanceOf(walletAddress, assetId);
        // return Number(balance);
        
        return Math.floor(Math.random() * 250); 
    } catch (e) {
        console.warn("Web3 check failed, returning mock", e);
        return 0;
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const provider = getProvider();
    if (!provider) throw new Error("No wallet connected.");
    
    // Request account access if needed
    const signer = await provider.getSigner();
    const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, signer);
    
    // Asset ID string to BigInt hash (ethers v6)
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    // Simulate transaction for demo
    // const tx = await dcc1.redeemForNFT(numericAssetId);
    // await tx.wait();
    
    // Simulating delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
};

export default {};