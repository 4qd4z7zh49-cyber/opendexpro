"use client";

import { useEffect } from "react";
import Script from "next/script";
import { supabase } from "@/lib/supabaseClient";
import { getUserAccessToken } from "@/lib/clientAuth";
import {
  ensureOneSignalInitialized,
  isOneSignalConfigured,
  oneSignalLogin,
  oneSignalLogout,
} from "@/lib/onesignalClient";

export default function OneSignalBootstrap() {
  const enabled = isOneSignalConfigured();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const syncCurrentUser = async () => {
      try {
        await ensureOneSignalInitialized();
        const token = await getUserAccessToken();
        if (!token || cancelled) {
          await oneSignalLogout();
          return;
        }

        const { data, error } = await supabase.auth.getUser(token);
        if (cancelled || error) return;

        const uid = String(data.user?.id || "").trim();
        if (uid) {
          await oneSignalLogin(uid);
        }
      } catch {
        // Ignore OneSignal init/login runtime errors.
      }
    };

    void syncCurrentUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = String(session?.user?.id || "").trim();
      if (uid) {
        void oneSignalLogin(uid);
      } else {
        void oneSignalLogout();
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
