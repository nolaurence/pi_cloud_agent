import { randomId } from "../utils/uuid";

export async function detectPlaywrightExtension(): Promise<boolean> {
  const globalFlag = "__PLAYWRIGHT_MCP_EXTENSION__";
  if (globalFlag in window) return true;

  return new Promise((resolve) => {
    const nonce = randomId();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(false);
    }, 700);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string; nonce?: string };
      if (data?.source === "playwright-mcp-extension" && data.type === "pong" && data.nonce === nonce) {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(true);
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "pi-cloud-agent", type: "playwright-extension-ping", nonce }, window.location.origin);
  });
}
