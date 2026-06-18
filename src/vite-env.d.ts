/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase — primary (user-facing) database
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // Supabase — Loadopoly master database (optional dual-write)
  readonly VITE_LOADOPOLY_SUPABASE_URL?: string;
  readonly VITE_LOADOPOLY_SUPABASE_ANON_KEY?: string;

  // AI providers
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  /** Legacy / non-Vite key name used by some Google AI SDK examples */
  readonly API_KEY?: string;

  // Supply-Chain-Brain — optional cheap OCR/VLM tier (free-tier ensemble +
  // recall cache) tried ahead of costed providers when set.
  readonly VITE_SCB_OCR_URL?: string;

  // Web3
  readonly VITE_DCC1_ADDRESS?: string;

  // Feature flags — dynamically keyed as VITE_FF_<FLAG_NAME>
  readonly [key: `VITE_FF_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
