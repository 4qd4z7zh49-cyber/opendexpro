import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/router";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const session = supabase.auth.session();
    if (!session || session.user?.role !== "admin") {
      router.push("/admin/login");  // Redirect if the user is not an admin
    } else {
      setUser(session.user);
    }
  }, [router]);

  if (!user) return <div>Loading...</div>;  // Show loading until the user is verified

  return (
    <div>
      <h1>Admin Dashboard</h1>
      <p>Welcome, {user.email}</p>
      {/* Admin dashboard content here */}
    </div>
  );
}