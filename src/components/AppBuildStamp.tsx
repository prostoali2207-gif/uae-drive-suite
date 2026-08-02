import { APP_BUILD } from "@/lib/appBuild";

export function AppBuildStamp() {
  if (window.location.pathname.startsWith("/sign/")) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-2 z-40 rounded bg-background/85 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground/70 shadow-sm md:bottom-2"
      aria-hidden="true"
    >
      build {APP_BUILD.id}
    </div>
  );
}
