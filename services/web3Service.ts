import { ethers } from 'ethers';

const DCC1_ADDRESS = "0x71C7656EC7ab88b098defB751B7401B5f6d89A21"; 

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

declare global {
  interface Window {
    ethereum: any;
  }
}

export const connectWallet = async () => {
  if (typeof window === 'undefined') return null;

  if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
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
      throw new Error("No crypto wallet found. Please install MetaMask.");
  }
};

export const switchNetworkToPolygon = async (provider: ethers.BrowserProvider) => {
    const chainId = '0x89'; 
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId }]);
    } catch (switchError: any) {
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

export const redeemPhygitalCertificate = async (assetId: string) => {
    const wallet = await connectWallet();
    if (!wallet) throw new Error("Wallet not connected");

    const contract = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, wallet.signer);
    const numericAssetId = ethers.toBigInt(ethers.id(assetId));

    const tx = await contract.redeemForNFT(numericAssetId);
    const receipt = await tx.wait(1);
    
    return receipt?.hash;
};

export default {};