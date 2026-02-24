// pages/signup.tsx
import { useState } from 'react';
import { signUp } from '@/lib/auth';

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationCode, setInvitationCode] = useState(""); // Invitation code state

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({ email, invitationCode }), // sending invitation code
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      if (response.ok) {
        // Continue with sign up process if invitation code is valid
        await signUp(email, password);
      } else {
        alert(result.message); // Show error if failed
      }
    } catch (error) {
      alert("An error occurred");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Email:</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label>Password:</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <label>Invitation Code:</label> {/* Invitation code input */}
        <input
          type="text"
          value={invitationCode}
          onChange={(e) => setInvitationCode(e.target.value)} 
        />
      </div>
      <button type="submit">Sign Up</button>
    </form>
  );
}