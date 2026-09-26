import contentScript from "../content/autofill?script&iife";
import type { FrameResult } from "../content/autofill";
import { classifyFields, LayaError, matchOption } from "../classify/laya-client";
import { loadResume } from "../resume";
import { getSettings } from "../storage";
import type {
  FieldDebug,
  FillStats,
  FillTabResponse,
  LayaClassifyResponse,
  LayaMatchOptionResponse,
  Message,
} from "../types";

function errorResponse(error: unknown): { ok: false; error: string; offline: boolean } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    offline: error instanceof LayaError && error.offline,
  };
}

async function handleClassify(message: Extract<Message, { type: "LAYA_CLASSIFY" }>): Promise<LayaClassifyResponse> {
  try {
    const settings = await getSettings();
    return { ok: true, decisions: await classifyFields(settings, message.payload.fields) };
  } catch (error) {
    return errorResponse(error);
  }
}

async function handleMatchOption(
  message: Extract<Message, { type: "LAYA_MATCH_OPTION" }>,
): Promise<LayaMatchOptionResponse> {
  try {
    const settings = await getSettings();
    const { about, question, options } = message.payload;
    const result = await matchOption(settings, about, question, options);
    return { ok: true, ...result };
  } catch (error) {
    return errorResponse(error);
  }
}

async function fillTab(tabId: number, includeDebug: boolean): Promise<FillTabResponse> {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [contentScript] });
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (debug: boolean) =>
        (globalThis as unknown as { __layafill?: (debug: boolean) => Promise<unknown> }).__layafill?.(debug),
      args: [includeDebug],
    });

    const stats: FillStats = { filled: 0, review: 0, total: 0, layaOffline: false, resumeAttached: false };
    const debug: FieldDebug[] = [];
    const errors: string[] = [];
    for (const { result } of results) {
      const frame = result as FrameResult | undefined;
      if (!frame) continue;
      stats.filled += frame.stats.filled;
      stats.review += frame.stats.review;
      stats.total += frame.stats.total;
      stats.layaOffline ||= frame.stats.layaOffline;
      stats.resumeAttached ||= frame.stats.resumeAttached;
      if (frame.debug) debug.push(...frame.debug);
      if (frame.error) errors.push(frame.error);
    }
    if (stats.total === 0 && errors.length > 0) {
      return { ok: false, error: errors[0] };
    }
    if (stats.total === 0) {
      return { ok: false, error: "No fillable fields found on this page" };
    }
    return { ok: true, stats, debug: includeDebug ? debug : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Could not fill this page: ${message}` };
  }
}

async function fillActiveTab(includeDebug: boolean): Promise<FillTabResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab" };
  const response = await fillTab(tab.id, includeDebug);
  await showBadge(tab.id, response);
  return response;
}

async function showBadge(tabId: number, response: FillTabResponse): Promise<void> {
  const text = response.ok && response.stats ? String(response.stats.filled) : "!";
  const color = !response.ok ? "#dc2626" : response.stats?.layaOffline ? "#f59e0b" : "#16a34a";
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color });
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case "LAYA_CLASSIFY":
      void handleClassify(message).then(sendResponse);
      return true;
    case "LAYA_MATCH_OPTION":
      void handleMatchOption(message).then(sendResponse);
      return true;
    case "FILL_ACTIVE_TAB":
      void fillActiveTab(message.debug === true).then(sendResponse);
      return true;
    case "GET_RESUME":
      void loadResume()
        .catch(() => null)
        .then(sendResponse);
      return true;
    default:
      return false;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "fill-page") {
    void fillActiveTab(false);
  }
});
