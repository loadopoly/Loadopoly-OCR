import { createClient } from '@supabase/supabase-js';

// Environment variables must be set in your Vercel project settings
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req: any, res: any) {
  // CORS check
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Server configuration error: Missing Supabase keys' });
  }

  // 1. Validate Token
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { id } = req.query;
  const format = req.query.format || 'jsonl';

  try {
    // 2. Fetch Data (RLS will automatically apply if we were using the user's client, 
    // but here we are admin context so we manually check ownership)
    const { data, error } = await supabase
        .from('historical_documents_global')
        .select('*')
        .eq('user_id', user.id)
        .eq('dataset_id', id);

    if (error) throw error;

    if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Dataset not found or access denied' });
    }

    // 3. Stream Response
    if (format === 'parquet') {
        // Placeholder for Parquet conversion logic
        // In a real implementation, use 'parquetjs-lite' or similar to buffer data
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="dataset_${id}.parquet"`);
        res.status(501).json({ error: "Parquet export not yet implemented in this node version." });
    } else {
        // JSONL (JSON Lines) - Standard for ML training
        res.setHeader('Content-Type', 'application/jsonlines');
        res.setHeader('Content-Disposition', `attachment; filename="dataset_${id}.jsonl"`);
        
        // Write each row
        data.forEach((row: any) => {
            res.write(JSON.stringify(row) + '\n');
        });
        res.end();
    }

  } catch (err: any) {
      console.error("Export failed:", err);
      res.status(500).json({ error: err.message });
  }
}
