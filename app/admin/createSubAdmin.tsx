// app/admin/createSubAdmin.tsx

import { useState } from "react";

export default function CreateSubAdmin() {
  const [email, setEmail] = useState("");
  const [invitationCode, setInvitationCode] = useState("");
  const [subAdminId, setSubAdminId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch("/api/admin/assignInvite", {
      method: "POST",
      body: JSON.stringify({ email, invitationCode, subAdminId }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (response.ok) {
      alert("User invited successfully");
    } else {
      alert(data.message || "Error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label>Invitation Code</label>
        <input type="text" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} required />
      </div>
      <div>
        <label>Sub-admin ID</label>
        <input type="text" value={subAdminId} onChange={(e) => setSubAdminId(e.target.value)} required />
      </div>
      <button type="submit">Invite User</button>
    </form>
  );
}