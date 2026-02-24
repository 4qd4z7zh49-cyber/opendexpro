"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserAuthHeaders } from "@/lib/clientAuth";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
const ASSETS: Asset[] = ["USDT", "BTC", "ETH", "SOL", "XRP"];
const PRESET_AMOUNTS = [100, 300, 1000, 3000, 10000];

type WalletStateResp = {
  ok?: boolean;
  error?: string;
  holdings?: Record<string, number>;
};

type WithdrawRow = {
  id: string;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: "PENDING" | "CONFIRMED" | "FROZEN";
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type WithdrawHistoryResp = {
  ok?: boolean;
  error?: string;
  rows?: WithdrawRow[];
};

type WithdrawCreateResp = {
  ok?: boolean;
  error?: string;
  row?: WithdrawRow;
};

function fmtWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function fmtAmount(value: number, asset: Asset) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: asset === "USDT" ? 2 : 8,
  });
}

function normalizeStatus(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "FROZEN") return "FROZEN";
  return "PENDING";
}

function statusBadgeClass(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "border-emerald-300/30 bg-emerald-500/10 text-emerald-200";
  if (s === "FROZEN") return "border-rose-300/30 bg-rose-500/10 text-rose-200";
  return "border-amber-300/30 bg-amber-500/10 text-amber-200";
}

export default function WithdrawPage() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState<Asset>("USDT");
  const [amount, setAmount] = useState("100");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<WithdrawRow[]>([]);
  const [holdings, setHoldings] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const authHeaders = useCallback(async () => {
    return getUserAuthHeaders();
  }, []);

  const loadState = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const [walletRes, histRes] = await Promise.all([
        fetch("/api/wallet/state", {
          cache: "no-store",
          headers,
        }),
        fetch("/api/withdraw/history", {
          cache: "no-store",
          headers,
        }),
      ]);

      const walletJson = (await walletRes.json().catch(() => ({}))) as WalletStateResp;
      const histJson = (await histRes.json().catch(() => ({}))) as WithdrawHistoryResp;

      if (
        walletRes.status === 401 ||
        histRes.status === 401 ||
        walletJson?.error === "Unauthorized" ||
        histJson?.error === "Unauthorized"
      ) {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login?next=/withdraw");
        }
        throw new Error("Unauthorized");
      }

      if (!walletRes.ok || !walletJson?.ok) {
        throw new Error(walletJson?.error || "Failed to load wallet");
      }
      if (!histRes.ok || !histJson?.ok) {
        throw new Error(histJson?.error || "Failed to load withdraw history");
      }

      setHoldings(walletJson.holdings || {});
      setHistory(Array.isArray(histJson.rows) ? histJson.rows : []);
      setErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load withdraw page";
      if (message !== "Unauthorized") setErr(message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, router]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const available = useMemo(() => Number(holdings[asset] ?? 0), [holdings, asset]);

  const onCreateWithdraw = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Amount must be greater than 0");
      return;
    }
    if (!walletAddress.trim()) {
      setErr("Wallet address is required");
      return;
    }
    if (n > available) {
      setErr(`Insufficient ${asset} balance`);
      return;
    }

    setSaving(true);
    setErr("");
    setInfo("");

    try {
      const headers = await authHeaders();
      headers["Content-Type"] = "application/json";

      const res = await fetch("/api/withdraw/history", {
        method: "POST",
        headers,
        body: JSON.stringify({
          asset,
          amount: n,
          walletAddress: walletAddress.trim(),
          note: note.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as WithdrawCreateResp;
      if (!res.ok || !json?.ok || !json.row) {
        throw new Error(json?.error || "Failed to submit withdraw request");
      }

      setInfo(`Withdraw request submitted (${asset})`);
      setHistory((prev) => [json.row as WithdrawRow, ...prev].slice(0, 120));
      setWalletAddress("");
      setNote("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to submit withdraw request";
      setErr(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pt-5 pb-24">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-white">Withdraw Request</div>
              <div className="mt-1 text-sm text-white/60">
                Submit amount and destination address. Admin/Sub-admin will process status.
              </div>
            </div>
            <Link
              href="/wallet#exchange"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Exchange in Wallet
            </Link>
          </div>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
            {err}
          </div>
        ) : null}
        {info ? (
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {info}
          </div>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/70">Select amount</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESET_AMOUNTS.map((n) => {
              const active = Number(amount) === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm",
                    active
                      ? "border-blue-400/60 bg-blue-500/20 text-blue-200"
                      : "border-white/10 bg-black/20 text-white/70 hover:bg-white/10",
                  ].join(" ")}
                >
                  {n.toLocaleString()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Enter amount"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            />
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as Asset)}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            >
              {ASSETS.map((a) => (
                <option key={a} value={a} className="bg-black">
                  {a === "SOL" ? "Solana (SOL)" : a}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-2 text-xs text-white/60">
            Available {asset}: {fmtAmount(available, asset)}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/70">Destination wallet address</div>
          <input
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder={`${asset} address`}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          <div className="mt-3 text-sm text-white/70">Note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add extra details"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCreateWithdraw()}
              disabled={saving || loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Submitting..." : "Confirm Withdraw"}
            </button>
            <button
              type="button"
              onClick={() => void loadState()}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm"
            >
              Refresh
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 text-lg font-semibold text-white">Withdraw History</div>

          {loading ? <div className="text-sm text-white/60">Loading...</div> : null}

          {!loading && history.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
              No withdraw requests yet.
            </div>
          ) : null}

          {!loading && history.length > 0 ? (
            <div className="space-y-2">
              <div className="space-y-2 sm:hidden">
                {history.map((row) => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-white/60">{fmtWhen(row.createdAt)}</div>
                      <span
                        className={[
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusBadgeClass(row.status),
                        ].join(" ")}
                      >
                        {normalizeStatus(row.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-white/60">Asset</span>
                      <span className="shrink-0 font-semibold text-white">{row.asset}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-white/60">Amount</span>
                      <span className="shrink-0 font-semibold text-white">
                        {fmtAmount(Number(row.amount || 0), row.asset)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-white/50 break-all">{row.walletAddress}</div>
                    {row.note ? <div className="mt-1 text-xs text-white/50">Note: {row.note}</div> : null}
                  </div>
                ))}
              </div>

              <div className="hidden max-h-80 overflow-auto rounded-xl border border-white/10 sm:block">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-white/5 text-white/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Address</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="px-3 py-2 text-white/70">{fmtWhen(row.createdAt)}</td>
                        <td className="px-3 py-2">{row.asset}</td>
                        <td className="px-3 py-2 text-right">{fmtAmount(Number(row.amount || 0), row.asset)}</td>
                        <td className="px-3 py-2 text-white/80">{row.walletAddress}</td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "rounded-full border px-2 py-0.5 text-xs font-semibold",
                              statusBadgeClass(row.status),
                            ].join(" ")}
                          >
                            {normalizeStatus(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
