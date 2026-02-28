"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserAuthHeaders } from "@/lib/clientAuth";

type ThreadStatus = "OPEN" | "CLOSED";
type SenderRole = "USER" | "ADMIN";
type MessageType = "TEXT" | "IMAGE";

type SupportMessage = {
  id: string;
  threadId: string;
  senderRole: SenderRole;
  senderUserId: string | null;
  senderAdminId: string | null;
  message: string;
  messageType: MessageType;
  imageUrl: string | null;
  createdAt: string;
};

type SupportResponse = {
  ok?: boolean;
  error?: string;
  pollMs?: number;
  thread?: {
    id: string;
    userId: string;
    adminId: string | null;
    adminName: string | null;
    status: ThreadStatus;
    lastSender: SenderRole;
    lastMessageAt: string;
    createdAt: string;
  };
  messages?: SupportMessage[];
};

type SendResponse = {
  ok?: boolean;
  error?: string;
  message?: SupportMessage;
  thread?: {
    id: string;
    adminId: string | null;
    status: ThreadStatus;
    lastSender: SenderRole;
    lastMessageAt: string;
  };
};

const BASE_NAV_OFFSET = 64;
const SAFE_AREA_GAP = 6;

async function readJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

function fmtWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString();
}

function getImageName(message: SupportMessage) {
  const ts = new Date(message.createdAt || Date.now()).getTime();
  return `opendex-support-${Number.isFinite(ts) ? ts : Date.now()}.png`;
}

function downloadImage(url: string, name: string) {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

export default function SupportPage() {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const [thread, setThread] = useState<SupportResponse["thread"] | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pollMs, setPollMs] = useState(3000);
  const [pickedImageDataUrl, setPickedImageDataUrl] = useState("");
  const [pickedImageName, setPickedImageName] = useState("");
  const [imageMenuId, setImageMenuId] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewImageName, setPreviewImageName] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(220);

  const authHeaders = useCallback(async () => {
    return getUserAuthHeaders();
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/support", {
        cache: "no-store",
        headers,
      });
      const json = await readJson<SupportResponse>(res);

      if (res.status === 401 || json?.error === "Unauthorized") {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace("/login?next=/support");
        }
        throw new Error("Unauthorized");
      }

      if (!res.ok || !json?.ok || !json.thread) {
        throw new Error(json?.error || "Failed to load support chat");
      }

      setThread(json.thread);
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setPollMs(Math.max(1800, Number(json.pollMs ?? 3000)));
      setErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load support chat";
      if (message !== "Unauthorized") setErr(message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, router]);

  useEffect(() => {
    void loadChat();
  }, [loadChat]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadChat();
    }, Math.max(1800, pollMs));
    return () => window.clearInterval(timer);
  }, [loadChat, pollMs]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const syncKeyboard = () => {
      const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      setKeyboardInset(inset);
    };

    syncKeyboard();
    vv.addEventListener("resize", syncKeyboard);
    vv.addEventListener("scroll", syncKeyboard);
    window.addEventListener("resize", syncKeyboard);

    return () => {
      vv.removeEventListener("resize", syncKeyboard);
      vv.removeEventListener("scroll", syncKeyboard);
      window.removeEventListener("resize", syncKeyboard);
    };
  }, []);

  useEffect(() => {
    const node = composerRef.current;
    if (!node) return;

    const syncComposerHeight = () => {
      setComposerHeight(node.offsetHeight || 220);
    };

    syncComposerHeight();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(syncComposerHeight);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const closeMenu = () => setImageMenuId("");
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  const onPickPhoto = () => {
    fileRef.current?.click();
  };

  const onPhotoChanged = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Only image files are allowed");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr("Image size must be 2MB or less");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setPickedImageDataUrl(dataUrl);
      setPickedImageName(file.name);
      setErr("");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to read image";
      setErr(message);
    }
  };

  const clearPhoto = () => {
    setPickedImageDataUrl("");
    setPickedImageName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const openPreview = (message: SupportMessage) => {
    if (!message.imageUrl) return;
    setPreviewImageUrl(message.imageUrl);
    setPreviewImageName(getImageName(message));
    setImageMenuId("");
  };

  const onSend = async () => {
    const message = draft.trim();
    if (!message && !pickedImageDataUrl) {
      setErr("Message or photo is required");
      return;
    }
    if (message.length > 4000) {
      setErr("Message is too long (max 4000)");
      return;
    }

    setSending(true);
    setErr("");

    try {
      const headers = await authHeaders();
      headers["Content-Type"] = "application/json";

      const res = await fetch("/api/support", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          imageDataUrl: pickedImageDataUrl || undefined,
        }),
      });
      const json = await readJson<SendResponse>(res);
      if (!res.ok || !json?.ok || !json.message) {
        throw new Error(json?.error || "Failed to send message");
      }

      setMessages((prev) => [...prev, json.message as SupportMessage]);
      setDraft("");
      clearPhoto();

      if (thread && json.thread) {
        setThread({
          ...thread,
          id: json.thread.id,
          adminId: json.thread.adminId,
          status: json.thread.status,
          lastSender: json.thread.lastSender,
          lastMessageAt: json.thread.lastMessageAt,
        });
      }
    } catch (e: unknown) {
      const messageText = e instanceof Error ? e.message : "Failed to send message";
      setErr(messageText);
    } finally {
      setSending(false);
      void loadChat();
    }
  };

  const statusMeta = useMemo(() => {
    const open = thread?.status !== "CLOSED";
    return {
      label: open ? "Active" : "Closed",
      className: open
        ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
        : "border-slate-300/60 bg-white/70 text-slate-600",
    };
  }, [thread?.status]);

  const composerBottom =
    keyboardInset > 0 ? keyboardInset + SAFE_AREA_GAP : BASE_NAV_OFFSET + SAFE_AREA_GAP;
  const contentBottomPadding = Math.max(220, composerHeight + composerBottom + 20);

  return (
    <>
      <div className="px-3 pt-4 overscroll-y-none" style={{ paddingBottom: `${contentBottomPadding}px` }}>
        <div className="mx-auto w-full max-w-[960px] space-y-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6">
            <h1 className="text-2xl font-bold text-white sm:text-5xl">
              opendex Client Support
            </h1>
            <p className="mt-2 text-sm text-white/60 sm:text-xl">
              Live chat is auto-synced every few seconds.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className={[
                  "rounded-full border px-4 py-1.5 text-sm font-semibold",
                  statusMeta.className,
                ].join(" ")}
              >
                {statusMeta.label}
              </span>
              <span className="text-xs text-white/55 sm:text-sm">Reply within working hours</span>
            </div>
          </div>

          {err ? (
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {err}
            </div>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-white/5 p-3 sm:p-4">
            <div
              ref={bodyRef}
              onWheelCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => e.stopPropagation()}
              className="h-[58dvh] min-h-[340px] space-y-3 overflow-y-auto overscroll-y-contain rounded-2xl border border-sky-200/70 bg-[radial-gradient(circle_at_top,_rgba(147,197,253,0.35),_rgba(255,255,255,0.94)_40%,_rgba(239,246,255,0.96)_100%)] p-2.5 touch-pan-y shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:h-[56dvh] sm:p-4"
              style={{
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorY: "contain",
                paddingBottom: `${Math.max(20, composerHeight + 18)}px`,
              }}
            >
              {loading ? <div className="text-sm text-white/60">Loading messages...</div> : null}

              {!loading && messages.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                  No messages yet. Start your first message now.
                </div>
              ) : null}

              {messages.map((row) => {
                const mine = row.senderRole === "USER";
                return (
                  <div
                    key={row.id}
                    className={["flex", mine ? "justify-end" : "justify-start"].join(" ")}
                  >
                    <div
                      className={[
                        "relative max-w-[88%] rounded-3xl px-3 py-2.5 text-base sm:max-w-[75%]",
                        mine
                          ? "bg-blue-600 text-white shadow-[0_10px_25px_rgba(37,99,235,0.4)]"
                          : "border border-white/10 bg-[#1d1f25] text-white/90",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-3 h-3 w-3 rotate-45",
                          mine
                            ? "-right-1.5 bg-blue-600"
                            : "-left-1.5 border-l border-t border-white/10 bg-[#1d1f25]",
                        ].join(" ")}
                        aria-hidden="true"
                      />

                      {row.messageType === "IMAGE" && row.imageUrl ? (
                        <div className="relative mb-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImageMenuId((prev) => (prev === row.id ? "" : row.id));
                            }}
                            className="absolute right-2 top-2 z-10 rounded-lg border border-black/25 bg-black/45 px-2 py-0.5 text-xs text-white/90"
                          >
                            ...
                          </button>

                          {imageMenuId === row.id ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-2 top-9 z-20 w-32 overflow-hidden rounded-lg border border-white/20 bg-[#111827] text-xs text-white shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
                            >
                              <button
                                type="button"
                                onClick={() => openPreview(row)}
                                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadImage(row.imageUrl || "", getImageName(row));
                                  setImageMenuId("");
                                }}
                                className="block w-full px-3 py-2 text-left hover:bg-white/10"
                              >
                                Download
                              </button>
                            </div>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => openPreview(row)}
                            className="block rounded-xl"
                          >
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={row.imageUrl}
                                alt="chat image"
                                className="max-h-72 w-auto max-w-full rounded-xl border border-white/20 object-contain"
                              />
                            </>
                          </button>
                        </div>
                      ) : null}

                      {row.message ? (
                        <div className="whitespace-pre-wrap break-words">{row.message}</div>
                      ) : null}

                      <div
                        className={[
                          "mt-1.5 flex items-center justify-end gap-1 text-xs",
                          mine ? "text-blue-100/90" : "text-white/55",
                        ].join(" ")}
                      >
                        <span>{fmtWhen(row.createdAt)}</span>
                        {mine ? <span>• Sent</span> : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <div
        className="fixed inset-x-0 z-40 px-3"
        style={{ bottom: `${composerBottom}px` }}
      >
        <div
          ref={composerRef}
          className="mx-auto w-full max-w-[960px] rounded-3xl border border-sky-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(239,246,255,0.78))] p-3 shadow-[0_-12px_34px_rgba(82,132,198,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset] backdrop-blur-2xl sm:p-3.5"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPhotoChanged(e.target.files?.[0])}
          />

          {pickedImageDataUrl ? (
            <div className="mb-2.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
              <div className="h-11 w-11 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pickedImageDataUrl}
                    alt="preview"
                    className="h-full w-full object-cover"
                  />
                </>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-white/70">{pickedImageName || "Selected photo"}</div>
                <div className="text-[11px] text-white/45">Photo ready to send</div>
              </div>
              <button
                type="button"
                onClick={clearPhoto}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
              >
                Remove
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-2xl border border-sky-200/70 bg-white/75 px-2 py-2">
            <button
              type="button"
              onClick={onPickPhoto}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/85 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] hover:bg-white/10"
              aria-label="Attach photo"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  d="M21.44 11.05 12.25 20.24a5.5 5.5 0 1 1-7.78-7.78l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95L9.41 17.41a1.5 1.5 0 1 1-2.12-2.12l8.49-8.48"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!sending) void onSend();
                }
              }}
              className="h-11 min-w-0 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-white/45"
            />

            <button
              type="button"
              onClick={() => void onSend()}
              disabled={sending || (!draft.trim() && !pickedImageDataUrl)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#2563eb,#1d4ed8)] text-white shadow-[0_8px_22px_rgba(37,99,235,0.45)] disabled:opacity-60"
              aria-label="Send message"
            >
              {sending ? (
                <span className="text-xs font-semibold">...</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M5 12h12" strokeLinecap="round" />
                  <path d="m13 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {previewImageUrl ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close image preview"
            onClick={() => setPreviewImageUrl("")}
            className="absolute inset-0"
          />
          <div className="relative z-[71] w-full max-w-3xl rounded-2xl border border-white/15 bg-[#090b11] p-3">
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImageUrl}
                alt="preview full"
                className="max-h-[72vh] w-full rounded-xl object-contain"
              />
            </>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => downloadImage(previewImageUrl, previewImageName || `opendex-${Date.now()}.png`)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => setPreviewImageUrl("")}
                className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
