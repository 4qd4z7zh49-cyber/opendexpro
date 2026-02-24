// app/admin/(dashboard)/layout.tsx
import AdminShell from "./AdminShell";
import AdminSidebar from "../components/AdminSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell sidebar={<AdminSidebar />}>{children}</AdminShell>;
}