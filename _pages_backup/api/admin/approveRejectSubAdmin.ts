// pages/api/admin/approveRejectSubAdmin.ts
import { supabase } from "@/lib/supabaseClient";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { userId, action } = req.body; // `userId` = user ID, `action` = approve/reject

  if (!userId || !action) {
    return res.status(400).json({ message: "Invalid input" });
  }

  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ message: "Invalid action" });
  }

  try {
    // Update status of sub-admin user
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("id", userId);

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    return res.status(200).json({ message: `Sub-admin ${status} successfully.` });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}