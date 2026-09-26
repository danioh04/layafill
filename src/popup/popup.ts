import { checkHealth } from "../classify/laya-client";
import { getProfile, getSettings } from "../storage";
import type { FillTabResponse, Message } from "../types";

const fillBtn = document.querySelector<HTMLButtonElement>("#fill-btn")!;
const resultEl = document.querySelector<HTMLParagraphElement>("#result")!;
const serverDot = document.querySelector<HTMLSpanElement>("#server-dot")!;
const serverText = document.querySelector<HTMLSpanElement>("#server-text")!;
const profileWarning = document.querySelector<HTMLParagraphElement>("#profile-warning")!;

function setResult(text: string, kind: "ok" | "warn" | "error"): void {
  resultEl.textContent = text;
  resultEl.dataset.kind = kind;
}

async function showServerStatus(): Promise<void> {
  const settings = await getSettings();
  if (!settings.useLaya) {
    serverDot.dataset.kind = "warn";
    serverText.textContent = "Laya off: rules only";
    return;
  }
  const health = await checkHealth(settings);
  if (health.ok) {
    serverDot.dataset.kind = "ok";
    const details = [health.loaded?.join(", "), health.device].filter(Boolean).join(" · ");
    serverText.textContent = `Laya ready${details ? ` (${details})` : ""}`;
  } else {
    serverDot.dataset.kind = "error";
    serverText.textContent = "Laya offline: rules only. Run server\\start.ps1";
  }
}

async function showProfileWarning(): Promise<void> {
  const profile = await getProfile();
  profileWarning.hidden = Boolean(profile.firstName || profile.email);
}

function describe(response: FillTabResponse): void {
  if (!response.ok || !response.stats) {
    setResult(response.error ?? "Could not fill this page", "error");
    return;
  }
  const { filled, review, total, layaOffline } = response.stats;
  const parts = [`Filled ${filled} of ${total} fields`];
  if (review > 0) parts.push(`${review} need you`);
  if (layaOffline) parts.push("Laya offline, rules only");
  setResult(parts.join(" · "), layaOffline || filled === 0 ? "warn" : "ok");
}

async function fill(debug: boolean): Promise<FillTabResponse> {
  fillBtn.disabled = true;
  fillBtn.textContent = "Filling…";
  resultEl.textContent = "";
  try {
    const response = (await chrome.runtime.sendMessage<Message, FillTabResponse>({
      type: "FILL_ACTIVE_TAB",
      debug,
    })) as FillTabResponse;
    describe(response);
    return response;
  } finally {
    fillBtn.disabled = false;
    fillBtn.textContent = "Fill this page";
  }
}

function download(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

fillBtn.addEventListener("click", () => {
  void fill(false);
});

document.querySelector("#settings-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  void chrome.runtime.openOptionsPage();
});

document.querySelector("#debug-link")?.addEventListener("click", (event) => {
  event.preventDefault();
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await fill(true);
    if (response.debug) {
      const host = tab?.url ? new URL(tab.url).hostname : "page";
      download(`layafill-debug-${host}.json`, { url: tab?.url, stats: response.stats, fields: response.debug });
    }
  })();
});

void showServerStatus();
void showProfileWarning();
