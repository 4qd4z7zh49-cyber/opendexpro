type SendPushInput = {
  externalUserIds: string[];
  title: string;
  message: string;
  url?: string;
  data?: Record<string, unknown>;
};

function getConfig() {
  const appId = String(process.env.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  const apiKey = String(process.env.ONESIGNAL_REST_API_KEY || "").trim();
  return { appId, apiKey };
}

export function isOneSignalServerConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.appId && cfg.apiKey);
}

export async function sendOneSignalPush(input: SendPushInput) {
  const { appId, apiKey } = getConfig();
  const externalUserIds = Array.from(
    new Set((input.externalUserIds || []).map((id) => String(id || "").trim()).filter(Boolean))
  );

  if (!appId || !apiKey || externalUserIds.length === 0) {
    return { ok: false as const, skipped: true as const };
  }

  const body = {
    app_id: appId,
    target_channel: "push",
    include_aliases: {
      external_id: externalUserIds,
    },
    headings: {
      en: String(input.title || "OpenBookPro"),
    },
    contents: {
      en: String(input.message || ""),
    },
    url: input.url ? String(input.url) : undefined,
    data: input.data || undefined,
  };

  const response = await fetch("https://api.onesignal.com/notifications?c=push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OneSignal push failed (${response.status}): ${text || response.statusText}`);
  }

  return { ok: true as const };
}

