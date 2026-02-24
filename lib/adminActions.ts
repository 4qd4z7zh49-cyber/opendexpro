// lib/adminActions.ts

import { supabase } from "@/lib/supabaseClient";

export const approveSubAdmin = async (userId: string) => {
  const { error } = await supabase
    .from("profiles")
    .update({ role: "sub-admin", status: "APPROVED" })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
};

export const rejectSubAdmin = async (userId: string) => {
  const { error } = await supabase
    .from("profiles")
    .update({ status: "REJECTED" })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }
};