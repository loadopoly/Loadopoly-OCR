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

export const deleteUserAccount = async () => {
  if (!supabase) return { error: { message: "Supabase not configured" } };
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { message: "No user logged in" } };

  // 1. Delete user data from historical_documents_global
  const { error: dataError } = await supabase
    .from('historical_documents_global')
    .delete()
    .eq('USER_ID', user.id);

  if (dataError) return { error: dataError };

  // 2. Call RPC to delete the user from auth.users (requires a postgres function)
  const { error: rpcError } = await supabase.rpc('delete_user_account');
  
  if (rpcError) {
    console.error("RPC deletion failed, falling back to sign out only:", rpcError);
  }

  // 3. Sign out
  return signOut();
}
