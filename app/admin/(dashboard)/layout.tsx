// app/admin/(dashboard)/layout.tsx
import { Suspense } from "react";
import AdminShell from "./AdminShell";
import AdminSidebar from "../components/AdminSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#06080d]" />}>
      <AdminShell sidebar={<AdminSidebar />}>{children}</AdminShell>
    </Suspense>
  );
}
