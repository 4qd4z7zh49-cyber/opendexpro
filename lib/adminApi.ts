// lib/adminApi.ts
export async function adminTopup(input: {
  user_id: string;       // existing style
  amount: number;
  asset: "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
  note?: string;
}) {
  const r = await fetch("/api/admin/topup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: input.user_id,
      amount: input.amount,
      asset: input.asset,
      note: input.note,
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Topup failed");
  return j;
}