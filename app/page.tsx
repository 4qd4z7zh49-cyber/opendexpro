import Landing from "./(marketing)/landing/page";
import MaintenanceCover from "@/app/components/MaintenanceCover";
import {
  FRONTEND_MAINTENANCE_COVER_ENABLED,
  FRONTEND_MAINTENANCE_MESSAGE,
} from "@/lib/maintenance";

export default function Page() {
  if (FRONTEND_MAINTENANCE_COVER_ENABLED) {
    return (
      <MaintenanceCover
        message={FRONTEND_MAINTENANCE_MESSAGE}
        note="Please wait while maintenance update is being completed."
      />
    );
  }

  return <Landing />;
}
