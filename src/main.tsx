import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AppBuildStamp } from "@/components/AppBuildStamp";
import { installInteractionLockWatchdog } from "@/lib/interactionLocks";
import { logAppBuild } from "@/lib/appBuild";
import "./index.css";

logAppBuild();
installInteractionLockWatchdog();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <AppBuildStamp />
  </>,
);
