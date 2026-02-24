// components/admin/CreateSubAdminForm.tsx

import { useState } from "react";

export default function CreateSubAdminForm() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [invitationCode, setInvitationCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // POST request to create sub-admin
    const response = await fetch("/api/admin/createSubAdmin", {
      method: "POST",
      body: JSON.stringify({ email, username, invitationCode }),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (response.ok) {
      alert("Sub-admin created successfully");
    } else {
      alert(data.message || "Error occurred while creating sub-admin");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label>Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div>
        <label>Invitation Code</label>
        <input
          type="text"
          value={invitationCode}
          onChange={(e) => setInvitationCode(e.target.value)}
        />
      </div>
      <button type="submit">Create Sub-Admin</button>
    </form>
  );
}