
// Type declaration for global (from UMD CDN)
declare global {
  interface Window {
    ethers: any;
    ethereum: any;
  }
}

// Access via global or dynamic import
let ethers: any = null;

// Helper to ensure ethers is loaded
const ensureEthers = async () => {
    if (ethers) return ethers;

    if (typeof window !== 'undefined' && window.ethers) {
        ethers = window.ethers;
        return ethers;
    }

    // Fallback: try dynamic import if supported (for dev envs where CDN might fail)
    try {
        // @ts-ignore
        const mod = await import('ethers');
        ethers = mod;
        return ethers;
    } catch (e) {
        /* ignore build time error */
    }

    if (!ethers) {
        throw new Error('Ethers library not loaded. Ensure CDN is in index.html.');
    }
    return ethers;
}

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

export const getProvider = async () => {
  const e = await ensureEthers();
  if (!window.ethereum) throw new Error('No Ethereum wallet detected');
  return new e.BrowserProvider(window.ethereum);
};

export const connectWallet = async () => {
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

export default ethers;