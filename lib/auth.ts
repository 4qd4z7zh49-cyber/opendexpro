import { supabase } from "@/lib/supabaseClient";

// Sign-up function
export const signUp = async (email: string, password: string) => {
  return supabase.auth.signUp({
    email,
    password,
  });
};

// Sign-in function
export const signIn = async (email: string, password: string) => {
  return supabase.auth.signInWithPassword({
    email,
    password,
  });
};

// Sign-out function
export const signOut = async () => {
  return supabase.auth.signOut();
};

// You can add more logic for role-based access if needed