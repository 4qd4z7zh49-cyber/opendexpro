"use client";

import { useState } from "react";

type Props = {
  userId: string;
  username: string;
  email?: string;
  onSuccess?: () => void;
};

const ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"];

export default function TopupPanel({
  userId,
  username,
  email,
  onSuccess,
}: Props) {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setError("");

    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Invalid amount");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          amount: value,
          asset,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Topup failed");
      } else {
        setAmount("");
        if (onSuccess) onSuccess();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Server error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0b] p-5">
      <div className="text-lg font-semibold">Fill amount</div>
      <div className="mt-1 text-white/60">
        {username} {email ? `(${email})` : ""}
      </div>

      {/* Asset Selector */}
      <select
        value={asset}
        onChange={(e) => setAsset(e.target.value)}
        className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
      >
        {ASSETS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      {/* Amount */}
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
      />

      {error && (
        <div className="mt-3 text-sm text-red-500">{error}</div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          disabled={loading}
          onClick={handleConfirm}
          className="rounded-xl bg-blue-600 px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Processing..." : "Confirm"}
        </button>
      </div>
    </div>
  );
}
