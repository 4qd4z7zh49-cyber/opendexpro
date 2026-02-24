// lib/typesAdmin.ts
export type AdminUserRow = {
  id: string;
  username: string | null;
  email: string | null;
  balances: { balance: number } | null;
};

export type TopupRow = {
  id: string;
  user_id: string;
  admin_id: string;
  amount: number;
  note: string | null;
  created_at: string;
  username?: string | null; // optional (view join ကနေလည်းလာနိုင်)
};

export type MiningOrderRow = {
  id: string;
  user_id: string;
  plan_id: string;
  amount: number;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "ABORTED" | "COMPLETED";
  created_at: string;
  activated_at?: string | null;
  note?: string | null;
  username?: string | null;
  email?: string | null;
};
