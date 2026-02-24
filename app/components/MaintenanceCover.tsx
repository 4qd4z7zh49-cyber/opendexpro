type MaintenanceCoverProps = {
  message: string;
  note?: string;
};

export default function MaintenanceCover({ message, note }: MaintenanceCoverProps) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#06090f] px-6 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-[-100px] h-[320px] w-[320px] rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -right-24 top-[10%] h-[300px] w-[300px] rounded-full bg-orange-500/20 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/2 h-[380px] w-[380px] -translate-x-1/2 rounded-full bg-red-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-amber-300/25 bg-black/45 p-8 text-center shadow-[0_25px_80px_rgba(0,0,0,.55)] backdrop-blur">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/35 bg-amber-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 animate-pulse text-amber-300">
            <path
              d="M12 3 1.8 20.5h20.4L12 3Zm0 5.1a1 1 0 0 1 1 1v5.6a1 1 0 1 1-2 0V9.1a1 1 0 0 1 1-1Zm0 10a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4Z"
              fill="currentColor"
            />
          </svg>
          Warning
        </div>

        <p className="text-2xl font-semibold tracking-tight text-amber-50 sm:text-3xl">{message}</p>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
          {note || "Maintenance is currently in progress. Please check back shortly."}
        </p>

        <div className="mt-8 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-bounce" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-bounce [animation-delay:150ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
