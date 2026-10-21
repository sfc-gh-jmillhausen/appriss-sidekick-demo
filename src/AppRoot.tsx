// Shared entry for Vite (src/main.tsx) and Next.js (app-runtime, loaded with ssr:false).
// Picks the chat or the Store Ops simulator by pathname; react-router is used only inside
// the simulator chunks. The appriss brand renders the Sidekick panel + Appriss portal layout.
import { lazy, Suspense } from "react";
import { getBrand } from "./brand/brand.config";
import ChatApp from "./chat/ChatApp";

const StoreOpsApp = lazy(() => import("./apps/storeops/StoreOpsApp"));
const SidekickApp = lazy(() => import("./sidekick/SidekickApp"));

export default function AppRoot() {
  const path = typeof location !== "undefined" ? location.pathname : "/";
  if (path.startsWith("/apps/storeops")) {
    return (
      <Suspense fallback={<div className="so-loading">Loading Store Ops…</div>}>
        <StoreOpsApp />
      </Suspense>
    );
  }
  if (getBrand().id === "appriss") {
    return (
      <Suspense fallback={null}>
        <SidekickApp />
      </Suspense>
    );
  }
  return <ChatApp />;
}
