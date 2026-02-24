// components/admin/UserTable.tsx

import React from "react";
import { approveSubAdmin, rejectSubAdmin } from "@/lib/adminActions";

type AdminUserRow = {
  id: string;
  username: string | null;
  email: string | null;
  status: string | null;
};

type UserTableProps = {
  users: AdminUserRow[];
};

export default function UserTable({ users }: UserTableProps) {
  const handleApprove = async (userId: string) => {
    await approveSubAdmin(userId);
  };

  const handleReject = async (userId: string) => {
    await rejectSubAdmin(userId);
  };

  return (
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Email</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user: AdminUserRow) => (
          <tr key={user.id}>
            <td>{user.username}</td>
            <td>{user.email}</td>
            <td>{user.status}</td>
            <td>
              <button onClick={() => handleApprove(user.id)}>Approve</button>
              <button onClick={() => handleReject(user.id)}>Reject</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
