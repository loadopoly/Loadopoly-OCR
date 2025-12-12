import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';

// Environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

// Contract Constants
const DCC1_ADDRESS = process.env.DCC1_ADDRESS || "0x71C7656EC7ab88b098defB751B7401B5f6d89A21";
const DCC1_ABI = [
  "function mintShards(address to, uint256 assetId) external"
];

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-mumbai.g.alchemy.com/v2/YOUR_KEY');

// Private key for the minter wallet
const privateKey = process.env.PRIVATE_KEY;
const wallet = privateKey ? new ethers.Wallet(privateKey, provider) : null;

export default async function handler(req: any, res: any) {
  if (!wallet) {
      return res.status(500).json({ error: "Server configuration error: Missing Private Key" });
  }

  const { assetId, userAddress } = req.body;

  if (!assetId || !userAddress) {
      return res.status(400).json({ error: "Missing assetId or userAddress" });
  }

  try {
      // Verify ownership
      // Note: This checks if the 'user_id' column matches 'userAddress'. 
      // Ensure your database 'user_id' stores the wallet address or the request sends the correct ID.
      const { data, error } = await supabase
        .from('historical_documents_global')
        .select('id')
        .eq('id', assetId)
        .eq('user_id', userAddress);

      if (error) {
          console.error("Supabase Error:", error);
          return res.status(500).json({ error: "Database error" });
      }

      if (!data?.length) return res.status(403).json({ error: 'Not owner' });

      const dcc1 = new ethers.Contract(DCC1_ADDRESS, DCC1_ABI, wallet);
      const tx = await dcc1.mintShards(userAddress, assetId);
      await tx.wait();

      // Update DB
      // Note: The snippet updates 'shard_token_id'. Ensure this column exists in your schema.
      const { error: updateError } = await supabase
        .from('historical_documents_global')
        .update({ shard_token_id: assetId })
        .eq('id', assetId);

      if (updateError) {
          console.error("DB Update Error:", updateError);
          // We don't fail the request if just the DB update fails after minting, 
          // but logging it is important.
      }

      res.json({ success: true, txHash: tx.hash });
  } catch (err: any) {
      console.error("Handler Error:", err);
      res.status(500).json({ error: err.message });
  }
}
