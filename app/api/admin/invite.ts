// src/api/admin/invite.ts

import { supabase } from "@/lib/supabaseClient";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { email, invitationCode } = req.body;

  if (!email || !invitationCode) {
    return res.status(400).json({ message: "Invalid input" });
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .upsert({
        email,
        invitation_code: invitationCode,
        role: "sub-admin",
      })
      .select();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.status(200).json({ message: "Sub-admin invited successfully", data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ message });
  }
}
