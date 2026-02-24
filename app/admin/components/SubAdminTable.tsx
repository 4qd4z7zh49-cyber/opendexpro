// app/admin/components/SubAdminTable.tsx

import React from 'react';

type SubAdminProps = {
  subAdmins: { id: string; username: string; status: string }[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
};

const SubAdminTable = ({ subAdmins, onApprove, onReject }: SubAdminProps) => {
  return (
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {subAdmins.map((admin) => (
          <tr key={admin.id}>
            <td>{admin.username}</td>
            <td>{admin.status}</td>
            <td>
              <button onClick={() => onApprove(admin.id)}>Approve</button>
              <button onClick={() => onReject(admin.id)}>Reject</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default SubAdminTable;