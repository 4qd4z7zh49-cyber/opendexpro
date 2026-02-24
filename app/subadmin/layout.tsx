// app/subadmin/layout.tsx
import React from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminShell from "../admin/(dashboard)/AdminShell";
import SubAdminSidebar from "./components/SubAdminSidebar";

export default async function SubAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await cookies(); // ✅ Next 16: await
  const session = c.get("admin_session")?.value;
  const role = c.get("admin_role")?.value;

  if (!session) redirect("/admin/login?next=/subadmin");

  const isSub = role === "sub-admin" || role === "subadmin";
  if (!isSub) redirect("/admin");

  return <AdminShell sidebar={<SubAdminSidebar />}>{children}</AdminShell>;
}