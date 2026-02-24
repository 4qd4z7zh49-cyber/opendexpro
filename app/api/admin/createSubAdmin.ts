// src/api/admin/createSubAdmin.ts

import { supabase } from "@/lib/supabaseClient";
import { NextApiRequest, NextApiResponse } from "next";

// Sub-admin creation handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { username, email, invitationCode } = req.body;

  // Check for valid input
  if (!email || !invitationCode || !username) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    // Verify Invitation Code
    const { data, error } = await supabase
      .from("profiles")
      .select("invitation_code")
      .eq("invitation_code", invitationCode)
      .single();

    if (error || !data) {
      return res.status(400).json({ message: "Invalid invitation code" });
    }

    // Create sub-admin (sign up with temporary password)
    const { error: signupError } = await supabase.auth.signUp({
      email,
      password: "temporaryPassword", // Generate a temp password
    });

    if (signupError) {
      return res.status(400).json({ message: signupError.message });
    }

    // Store sub-admin role
    await supabase.from("profiles").upsert({
      username,
      email,
      invitation_code: invitationCode,
      role: "sub-admin",
    });

    return res.status(200).json({ message: "Sub-admin created successfully" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ message });
  }
}
