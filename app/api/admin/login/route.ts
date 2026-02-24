import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RPC_TIMEOUT_MS = 10_000;
const RPC_RETRY_COUNT = 1;

type LoginRow = {
  id: string;
  role: string | null;
  username: string | null;
};

type VerifyLoginRpcResult = {
  data: LoginRow[] | null;
  error: { message: string } | null;
};

function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createClient(url, key);
}

function toMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  return String(value || "");
}

function isTransientErrorMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound")
  );
}

function isCryptMissingError(message: string) {
  const lower = message.toLowerCase();
  return lower.includes("function crypt(text, text) does not exist");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error("RPC timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runVerifyLoginRpc(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  username: string,
  password: string
): Promise<VerifyLoginRpcResult> {
  const { data, error } = await supabase.rpc("admin_verify_login", {
    p_username: username,
    p_password: password,
  });

  return {
    data: Array.isArray(data) ? (data as LoginRow[]) : null,
    error: error ? { message: String(error.message || "RPC error") } : null,
  };
}

async function verifyLoginWithRetry(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  username: string,
  password: string
) {
  let lastErrorMessage = "";

  for (let attempt = 0; attempt <= RPC_RETRY_COUNT; attempt += 1) {
    try {
      const { data, error } = await withTimeout(
        runVerifyLoginRpc(supabase, username, password),
        RPC_TIMEOUT_MS
      );

      if (!error) {
        return { data, errorMessage: "" };
      }

      const msg = toMessage(error.message);
      lastErrorMessage = msg;
      if (!isTransientErrorMessage(msg) || attempt === RPC_RETRY_COUNT) {
        return { data: null, errorMessage: msg };
      }
    } catch (error: unknown) {
      const msg = toMessage(error);
      lastErrorMessage = msg;
      if (!isTransientErrorMessage(msg) || attempt === RPC_RETRY_COUNT) {
        return { data: null, errorMessage: msg };
      }
    }
  }

  return { data: null, errorMessage: lastErrorMessage || "Login verification failed" };
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username/Password လိုအပ်ပါတယ်" }, { status: 400 });
    }

    const { data, errorMessage } = await verifyLoginWithRetry(
      supabase,
      String(username).trim(),
      String(password)
    );
    if (errorMessage) {
      if (isTransientErrorMessage(errorMessage)) {
        return NextResponse.json(
          { error: "Login service ခဏမရနိုင်ပါ။ ပြန်စမ်းပါ။" },
          { status: 503 }
        );
      }
      if (isCryptMissingError(errorMessage)) {
        return NextResponse.json(
          {
            error:
              "Database auth function setup မပြီးသေးပါ။ pgcrypto/`admin_verify_login` function configuration ကိုစစ်ပါ။",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.id) {
      return NextResponse.json({ error: "Username/Password မမှန်ပါ" }, { status: 401 });
    }

    const dashboardPath =
      row.role === "sub-admin" || row.role === "subadmin"
        ? "/subadmin"
        : "/admin";

    const res = NextResponse.json({
      ok: true,
      role: row.role,
      username: row.username,
      id: row.id,
      redirect: dashboardPath,
    });

    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    };

    res.cookies.set("admin_session", "active", cookieOpts);
    res.cookies.set("admin_role", String(row.role || ""), cookieOpts);
    res.cookies.set("admin_id", String(row.id), cookieOpts); // ✅ IMPORTANT

    return res;
  } catch (error: unknown) {
    const message = toMessage(error) || "Server error";
    if (isTransientErrorMessage(message)) {
      return NextResponse.json(
        { error: "Login service ခဏမရနိုင်ပါ။ ပြန်စမ်းပါ။" },
        { status: 503 }
      );
    }
    if (isCryptMissingError(message)) {
      return NextResponse.json(
        {
          error:
            "Database auth function setup မပြီးသေးပါ။ pgcrypto/`admin_verify_login` function configuration ကိုစစ်ပါ။",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
