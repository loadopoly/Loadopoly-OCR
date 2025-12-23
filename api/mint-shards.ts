import { createClient } from '@supabase/supabase-js';
import { ethers, JsonRpcProvider } from 'ethers';

// Environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY!;
const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.RPC_URL || "https://polygon-rpc.com";
const DCC1_ADDRESS = process.env.DCC1_ADDRESS || "0x0000000000000000000000000000000000000000";

const DCC1_ABI = [
  "function mintShards(address to, uint256 assetId) external"
];

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).send("Method Not Allowed");
  
  const { assetId, userId, walletAddress } = req.body;

  if (!privateKey) {
      return res.status(500).json({ error: "Server misconfiguration: No Private Key" });
  }

  // 1. Verify user owns the asset in Supabase
  const { data, error } = await supabase
    .from('historical_documents_global')
    .select('ASSET_ID, USER_ID')
    .eq('ASSET_ID', assetId)
    .eq('USER_ID', userId);

  if (error || !data?.length) {
      return res.status(403).json({ error: "Ownership verification failed or asset not found." });
  }

  try {
      // 2. Mint on-chain
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, wallet);

      // Convert assetId string to hash/int for Solidity if needed, or assume it fits in uint256
      const numericAssetId = ethers.toBigInt(ethers.id(assetId));

      const tx = await dcc1.mintShards(walletAddress, numericAssetId);
      await tx.wait();

      // 3. Update Supabase record
      await supabase
          .from('historical_documents_global')
          .update({ CONTRIBUTOR_NFT_MINTED: true })
          .eq('ASSET_ID', assetId);

      res.json({ success: true, txHash: tx.hash, message: "218 shards minted" });
  } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Blockchain transaction failed", details: err.message });
  }
}