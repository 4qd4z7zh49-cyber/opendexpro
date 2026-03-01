// app/(marketing)/layout.tsx
import type { ReactNode } from "react";
import MaintenanceCover from "@/app/components/MaintenanceCover";
import {
  FRONTEND_MAINTENANCE_COVER_ENABLED,
  FRONTEND_MAINTENANCE_MESSAGE,
} from "@/lib/maintenance";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  if (FRONTEND_MAINTENANCE_COVER_ENABLED) {
    return (
      <MaintenanceCover
        message={FRONTEND_MAINTENANCE_MESSAGE}
        note="Please wait while maintenance update is being completed."
      />
    );
  }

  return (
    <div className="marketing-shell">
      <div className="marketing-shell__aurora" aria-hidden />
      <div className="marketing-shell__content">{children}</div>
    </div>
  );
}
