"use client";

type OneSignalInitOptions = {
  appId: string;
  allowLocalhostAsSecureOrigin?: boolean;
};

type OneSignalSDK = {
  init: (options: OneSignalInitOptions) => Promise<void>;
  login: (externalId: string) => Promise<void> | void;
  logout: () => Promise<void> | void;
  Notifications: {
    requestPermission: () => Promise<void> | void;
    isPushSupported: () => boolean;
    permission: boolean;
  };
  User: {
    PushSubscription: {
      id?: string | null;
      optedIn?: boolean;
      optIn: () => Promise<void> | void;
      optOut: () => Promise<void> | void;
    };
  };
};

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalSDK) => void>;
    __opendexOneSignalInit?: boolean;
  }
}

export type OneSignalPushState = {
  configured: boolean;
  supported: boolean;
  permissionGranted: boolean;
  optedIn: boolean;
  subscriptionId: string | null;
};

const APP_ID = String(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();

let initPromise: Promise<void> | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

function ensureDeferredQueue() {
  if (!isBrowser()) return null;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  return window.OneSignalDeferred;
}

async function runWithOneSignal<T>(fn: (OneSignal: OneSignalSDK) => Promise<T> | T): Promise<T> {
  const queue = ensureDeferredQueue();
  if (!queue) throw new Error("OneSignal is only available in browser.");

  return await new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("OneSignal SDK is not ready yet."));
    }, 8000);

    queue.push((OneSignal) => {
      Promise.resolve(fn(OneSignal))
        .then((value) => {
          window.clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timeout);
          reject(error);
        });
    });
  });
}

export function isOneSignalConfigured() {
  return Boolean(APP_ID);
}

export async function ensureOneSignalInitialized() {
  if (!APP_ID) return false;
  if (!isBrowser()) return false;

  if (!initPromise) {
    initPromise = runWithOneSignal(async (OneSignal) => {
      if (window.__opendexOneSignalInit) return;

      await OneSignal.init({
        appId: APP_ID,
        allowLocalhostAsSecureOrigin: true,
      });
      window.__opendexOneSignalInit = true;
    }).catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  await initPromise;
  return true;
}

export async function oneSignalLogin(externalId: string) {
  const id = String(externalId || "").trim();
  if (!id || !APP_ID) return;
  await ensureOneSignalInitialized();
  await runWithOneSignal(async (OneSignal) => {
    await OneSignal.login(id);
  });
}

export async function oneSignalLogout() {
  if (!APP_ID) return;
  await ensureOneSignalInitialized();
  await runWithOneSignal(async (OneSignal) => {
    await OneSignal.logout();
  });
}

export async function oneSignalGetPushState(): Promise<OneSignalPushState> {
  if (!APP_ID) {
    return {
      configured: false,
      supported: false,
      permissionGranted: false,
      optedIn: false,
      subscriptionId: null,
    };
  }

  await ensureOneSignalInitialized();

  return await runWithOneSignal(async (OneSignal) => {
    const supported = Boolean(OneSignal.Notifications?.isPushSupported?.());
    const permissionGranted = Boolean(OneSignal.Notifications?.permission);
    const optedIn = Boolean(OneSignal.User?.PushSubscription?.optedIn);
    const subscriptionId = OneSignal.User?.PushSubscription?.id
      ? String(OneSignal.User.PushSubscription.id)
      : null;

    return {
      configured: true,
      supported,
      permissionGranted,
      optedIn,
      subscriptionId,
    };
  });
}

export async function oneSignalRequestPermission() {
  if (!APP_ID) {
    return await oneSignalGetPushState();
  }

  await ensureOneSignalInitialized();
  await runWithOneSignal(async (OneSignal) => {
    if (typeof OneSignal.Notifications?.requestPermission === "function") {
      await OneSignal.Notifications.requestPermission();
    }
  });
  return await oneSignalGetPushState();
}

export async function oneSignalSetOptIn(next: boolean) {
  if (!APP_ID) {
    return await oneSignalGetPushState();
  }

  await ensureOneSignalInitialized();
  await runWithOneSignal(async (OneSignal) => {
    if (next) {
      if (typeof OneSignal.User?.PushSubscription?.optIn === "function") {
        await OneSignal.User.PushSubscription.optIn();
      }
    } else {
      if (typeof OneSignal.User?.PushSubscription?.optOut === "function") {
        await OneSignal.User.PushSubscription.optOut();
      }
    }
  });
  return await oneSignalGetPushState();
}
