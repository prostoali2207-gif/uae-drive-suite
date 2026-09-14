import { createRoot } from "react-dom/client";
import { installInteractionLockWatchdog } from "@/lib/interactionLocks";
import { logAppBuild } from "@/lib/appBuild";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const isTelegramFinance =
  window.location.pathname === "/telegram-finance" ||
  window.location.pathname.startsWith("/telegram-finance/");

if (isTelegramFinance) {
  void import("./telegram-finance/TelegramFinanceApp.tsx").then(({ default: TelegramFinanceApp }) => {
    root.render(<TelegramFinanceApp />);
  });
} else {
  logAppBuild();
  installInteractionLockWatchdog();

  void import("./App.tsx").then(({ default: App }) => {
    root.render(<App />);
  });
}
