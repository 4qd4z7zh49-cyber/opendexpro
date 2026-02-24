// api/admin/assignInvite.ts
import { supabase } from "@/lib/supabaseClient";
import { NextApiRequest, NextApiResponse } from "next";

// Sub-admin invitation code logic
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { email, invitationCode, subAdminId } = req.body;

  if (!email || !invitationCode || !subAdminId) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    // Verify invitation code from the profiles table
    const { data, error } = await supabase
      .from("profiles")
      .select("invitation_code")
      .eq("invitation_code", invitationCode)
      .single();

    if (error || !data) {
      return res.status(400).json({ message: "Invalid invitation code" });
    }

    // Create sub-admin user and assign invitation code
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password: "temporaryPassword", // Can use temporary password or auto-generate one
    });

    if (signUpError) {
      return res.status(400).json({ message: signUpError.message });
    }

    // Store sub-admin data with role "user"
    await supabase.from("profiles").upsert({
      email,
      invitation_code: invitationCode,
      role: "user", // Default user role
      sub_admin_id: subAdminId, // Store the sub-admin ID who invited the user
    });

    return res.status(200).json({ message: "User successfully invited" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ message });
  }
}
