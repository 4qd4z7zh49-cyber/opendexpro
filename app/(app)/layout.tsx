// app/(app)/layout.tsx
import type { ReactNode } from "react";
import BottomNav from "@/app/components/BottomNav";
import OneSignalBootstrap from "@/app/components/OneSignalBootstrap";
import MaintenanceCover from "@/app/components/MaintenanceCover";
import {
  FRONTEND_MAINTENANCE_COVER_ENABLED,
  FRONTEND_MAINTENANCE_MESSAGE,
} from "@/lib/maintenance";

export default function AppLayout({ children }: { children: ReactNode }) {
  if (FRONTEND_MAINTENANCE_COVER_ENABLED) {
    return (
      <MaintenanceCover
        message={FRONTEND_MAINTENANCE_MESSAGE}
        note="Please wait while maintenance update is being completed."
      />
    );
  }

  return (
    <div className="platform-frontend min-h-screen flex flex-col overflow-x-hidden text-slate-900">
      <div className="platform-frontend__aurora" aria-hidden />
      <OneSignalBootstrap />
      <main className="platform-frontend__main flex-1 overflow-x-hidden pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
