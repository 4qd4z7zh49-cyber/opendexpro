"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserAuthHeaders } from "@/lib/clientAuth";

type Asset = "USDT" | "BTC" | "ETH" | "SOL" | "XRP";
type AddressMap = Record<Asset, string>;

type DepositRow = {
  id: string;
  asset: Asset;
  amount: number;
  walletAddress: string;
  status: string;
  createdAt: string;
};

type DepositStateResponse = {
  ok?: boolean;
  error?: string;
  ownerAdmin?: {
    id: string;
    username: string | null;
    role: string | null;
  } | null;
  addresses?: Partial<Record<Asset, string>>;
  history?: DepositRow[];
};

type DepositCreateResponse = {
  ok?: boolean;
  error?: string;
  row?: DepositRow;
};

const ASSETS: Asset[] = ["USDT", "BTC", "ETH", "SOL", "XRP"];
const PRESET_AMOUNTS = [100, 300, 1000, 3000, 10000];

const EMPTY_ADDRESS_MAP: AddressMap = {
  USDT: "",
  BTC: "",
  ETH: "",
  SOL: "",
  XRP: "",
};

function fmtAmount(value: number, asset: Asset) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: asset === "USDT" ? 2 : 8,
  });
}

function fmtWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function normalizeStatus(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "CONFIRMED") return "CONFIRMED";
  if (s === "REJECTED") return "REJECTED";
  return "PENDING";
}

function statusClass(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "text-emerald-300";
  if (s === "REJECTED") return "text-rose-300";
  return "text-amber-200";
}

function statusBadgeClass(status: string) {
  const s = normalizeStatus(status);
  if (s === "CONFIRMED") return "border-emerald-300/30 bg-emerald-500/10 text-emerald-200";
  if (s === "REJECTED") return "border-rose-300/30 bg-rose-500/10 text-rose-200";
  return "border-amber-300/30 bg-amber-500/10 text-amber-200";
}

export default function DepositPage() {
  const router = useRouter();
  const redirectedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState<Asset>("USDT");
  const [amount, setAmount] = useState("100");
  const [addresses, setAddresses] = useState<AddressMap>(EMPTY_ADDRESS_MAP);
  const [history, setHistory] = useState<DepositRow[]>([]);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const authHeaders = useCallback(async () => {
    return getUserAuthHeaders();
  }, []);

  const loadState = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/deposit/state", {
        cache: "no-store",
        headers,
      });
      const json = (await res.json().catch(() => ({}))) as DepositStateResponse;

      if (res.status === 401 || json?.error === "Unauthorized") {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login?next=/deposit");
        }
        throw new Error("Unauthorized");
      }

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load deposit data");
      }

      const nextAddressMap: AddressMap = {
        USDT: String(json.addresses?.USDT || ""),
        BTC: String(json.addresses?.BTC || ""),
        ETH: String(json.addresses?.ETH || ""),
        SOL: String(json.addresses?.SOL || ""),
        XRP: String(json.addresses?.XRP || ""),
      };

      setAddresses(nextAddressMap);
      setHistory(Array.isArray(json.history) ? json.history : []);
      setErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load deposit data";
      if (message !== "Unauthorized") {
        setErr(message);
      }
    } finally {
      setLoading(false);
    }
  }, [authHeaders, router]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const currentAddress = useMemo(() => String(addresses[asset] || "").trim(), [addresses, asset]);

  const onCopyAddress = async () => {
    if (!currentAddress) return;
    try {
      await navigator.clipboard.writeText(currentAddress);
      setInfo(`${asset} address copied`);
      setErr("");
    } catch {
      setErr("Failed to copy address");
    }
  };

  const onCreateHistory = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("Amount must be greater than 0");
      return;
    }

    setSaving(true);
    setErr("");
    setInfo("");

    try {
      const headers = await authHeaders();
      headers["Content-Type"] = "application/json";

      const res = await fetch("/api/deposit/history", {
        method: "POST",
        headers,
        body: JSON.stringify({
          asset,
          amount: n,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as DepositCreateResponse;
      if (!res.ok || !json?.ok || !json.row) {
        throw new Error(json?.error || "Failed to create deposit history");
      }

      setInfo(`Deposit request submitted (${asset})`);
      setHistory((prev) => [json.row as DepositRow, ...prev].slice(0, 50));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create deposit history";
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
            <div className="text-2xl font-bold text-white">Deposit ON-CHAIN</div>
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
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-white/70">{asset} wallet address</div>

          <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/90 break-all">
            {currentAddress || "Address not configured yet. Contact admin/sub-admin."}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onCopyAddress()}
              disabled={!currentAddress}
              className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Copy Address
            </button>
            <button
              type="button"
              onClick={() => void onCreateHistory()}
              disabled={saving || !currentAddress || loading}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Sending..." : "Send Deposit Request"}
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
          <div className="mb-3 text-lg font-semibold text-white">Deposit Requests</div>

          {loading ? <div className="text-sm text-white/60">Loading...</div> : null}

          {!loading && history.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
              No deposit requests yet.
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
                  </div>
                ))}
              </div>

              <div className="hidden max-h-80 overflow-auto rounded-xl border border-white/10 sm:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-white/5 text-white/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Time</th>
                      <th className="px-3 py-2 text-left">Asset</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Wallet Address</th>
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
                        <td className={`px-3 py-2 font-semibold ${statusClass(row.status)}`}>
                          {normalizeStatus(row.status)}
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
