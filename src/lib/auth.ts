import { supabase } from '../services/supabaseService';

export const signUp = async (email: string, password: string) => {
  if (!supabase) return { data: { user: null, session: null }, error: { message: "Supabase not configured", name: "ConfigError", status: 500 } };
  return supabase.auth.signUp({ email, password });
}

export const signIn = async (email: string, password: string) => {
  if (!supabase) return { data: { user: null, session: null }, error: { message: "Supabase not configured", name: "ConfigError", status: 500 } };
  return supabase.auth.signInWithPassword({ email, password });
}

export const signOut = async () => {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  return supabase.auth.signOut();
}

export const getCurrentUser = async () => {
  if (!supabase) return { data: { user: null }, error: { message: "Supabase not configured" } };
  return supabase.auth.getUser();
}
