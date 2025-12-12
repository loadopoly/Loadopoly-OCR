
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

// Type declaration for global ethers
declare global {
  interface Window {
    ethers: any;
    ethereum: any;
  }
}

// Safe accessor for global ethers
const getEthers = () => {
  if (typeof window === 'undefined') return null;
  const e = window.ethers;
  if (!e) {
    console.warn("Ethers.js not loaded from CDN");
    throw new Error("Ethers library not loaded");
  }
  return e;
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
    try {
        const ethers = getEthers();
        if (!ethers || !window.ethereum) return 0;
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        // This is a read-only call, strictly speaking we don't need a signer but using provider is fine
        // Mocking the return for this demo
        return Math.floor(Math.random() * 250); 
    } catch (e) {
        console.warn("Web3 check failed, returning mock", e);
        return 0;
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const ethers = getEthers();
    if (!ethers || !window.ethereum) throw new Error("No wallet connected.");

    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // Request account access if needed
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, signer);
    
    // Asset ID string to BigInt hash
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    // Simulate transaction
    // const tx = await dcc1.redeemForNFT(numericAssetId);
    // await tx.wait();
    
    // Simulating delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
};
