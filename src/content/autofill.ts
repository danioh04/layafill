import { runFill } from "../classify/pipeline";
import { storedFileToFile } from "../resume";
import { getProfile, getSettings } from "../storage";
import type {
  Decision,
  FieldContext,
  FieldDebug,
  FillStats,
  LayaClassifyResponse,
  LayaMatchOptionResponse,
  Message,
  StoredFile,
} from "../types";

class OfflineError extends Error {
  readonly offline = true;
}

async function classify(fields: FieldContext[]): Promise<Decision[]> {
  const response = (await chrome.runtime.sendMessage<Message, LayaClassifyResponse>({
    type: "LAYA_CLASSIFY",
    payload: { fields },
  })) as LayaClassifyResponse | undefined;
  if (!response) throw new Error("No response from the extension background");
  if (!response.ok) {
    if (response.offline) throw new OfflineError(response.error);
    throw new Error(response.error);
  }
  return response.decisions;
}

async function matchOption(about: string, question: string, options: string[]): Promise<{ index: number | null }> {
  const response = (await chrome.runtime.sendMessage<Message, LayaMatchOptionResponse>({
    type: "LAYA_MATCH_OPTION",
    payload: { about, question, options },
  })) as LayaMatchOptionResponse | undefined;
  if (!response) return { index: null };
  if (!response.ok) {
    if (response.offline) throw new OfflineError(response.error);
    return { index: null };
  }
  return { index: response.index };
}

async function getResume(): Promise<File | null> {
  const stored = (await chrome.runtime.sendMessage<Message, StoredFile | null>({ type: "GET_RESUME" })) as
    | StoredFile
    | null
    | undefined;
  return stored ? storedFileToFile(stored) : null;
}

export interface FrameResult {
  stats: FillStats;
  debug?: FieldDebug[];
  error?: string;
}

let running = false;

async function run(includeDebug: boolean): Promise<FrameResult> {
  const empty: FillStats = { filled: 0, review: 0, total: 0, layaOffline: false, resumeAttached: false };
  if (running) return { stats: empty, error: "Already filling this page" };
  running = true;
  try {
    const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
    const result = await runFill(document, {
      profile,
      settings,
      classify,
      matchOption: settings.useLaya ? matchOption : undefined,
      getResume,
    });
    return includeDebug ? result : { stats: result.stats };
  } catch (error) {
    return { stats: empty, error: error instanceof Error ? error.message : String(error) };
  } finally {
    running = false;
  }
}

// The service worker calls this through chrome.scripting.executeScript({ func }) in every frame.
(globalThis as unknown as { __layafill?: typeof run }).__layafill = run;
