
// Type declaration for global (from UMD CDN)
declare global {
  interface Window {
    ethers: any;
    ethereum: any;
  }
}

// Access via global or dynamic import
let ethers: any = null;

const ensureEthers = async (): Promise<any> => {
  if (!ethers && typeof window !== 'undefined') {
    ethers = window.ethers;
    if (!ethers) {
      try {
        // Dynamic fallback via import map (no static import)
        // @ts-ignore
        const mod = await import('ethers');
        ethers = mod.default || mod;
        (window as any).ethers = ethers;
      } catch (e) {
        console.warn("Dynamic import of ethers failed", e);
      }
    }
  }
  if (!ethers) {
     // In a real scenario, we might want to fail gracefully, but for now throw to prompt check
     if (typeof window !== 'undefined') {
         throw new Error('Ethers not loaded - check CDN or connection');
     }
  }
  return ethers;
};

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

// Functions with loose types (no ethers types)
export const getProvider = async (): Promise<any> => {
  const e = await ensureEthers();
  if (!window.ethereum) throw new Error('No Ethereum wallet detected');
  return new e.BrowserProvider(window.ethereum);
};

export const connectWallet = async (): Promise<any> => {
  const provider = await getProvider();
  await provider.send('eth_requestAccounts', []);
  return await provider.getSigner();
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
        const e = await ensureEthers();
        if (!window.ethereum) return 0;
        
        const provider = new e.BrowserProvider(window.ethereum);
        // This is a read-only call, strictly speaking we don't need a signer but using provider is fine
        // Mocking the return for this demo
        return Math.floor(Math.random() * 250); 
    } catch (err) {
        console.warn("Web3 check failed, returning mock", err);
        return 0;
    }
};

export const redeemPhygitalCertificate = async (assetId: string) => {
    const e = await ensureEthers();
    const provider = await getProvider();
    
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    
    // Asset ID string to BigInt hash
    const numericAssetId = e.toBigInt(e.id(assetId));

    // Simulate transaction delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    return "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join('');
};

// Export loose ethers for direct access if needed
export { ethers as ethersLib };
export default ethers;
