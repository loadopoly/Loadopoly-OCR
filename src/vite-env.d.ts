/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase — primary (user-facing) database
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;

  // Supabase — Loadopoly master database (optional dual-write)
  readonly VITE_LOADOPOLY_SUPABASE_URL?: string;
  readonly VITE_LOADOPOLY_SUPABASE_ANON_KEY?: string;

  // AI providers
  /** SCB GeoGraph VLM gateway (default http://127.0.0.1:8787) */
  readonly VITE_SCB_VLM_URL?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_OPENAI_API_KEY?: string;
  /** Legacy / non-Vite key name used by some Google AI SDK examples */
  readonly API_KEY?: string;

  // Web3
  readonly VITE_DCC1_ADDRESS?: string;

  // Feature flags — dynamically keyed as VITE_FF_<FLAG_NAME>
  readonly [key: `VITE_FF_${string}`]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
