import type { Decision, FieldContext, Settings } from "../types";
import {
  buildFieldRequest,
  buildOptionRequest,
  parseFieldResponse,
  parseOptionResponse,
  type LayaRequest,
  type LayaResponse,
} from "./laya";

const REQUEST_TIMEOUT_MS = 20_000;
const HEALTH_TIMEOUT_MS = 3_000;
/** laya-serve runs one forward pass at a time; a few in flight hides HTTP latency. */
const CONCURRENCY = 4;

export class LayaError extends Error {
  constructor(
    message: string,
    readonly offline: boolean,
  ) {
    super(message);
    this.name = "LayaError";
  }
}

type LayaSettings = Pick<Settings, "serverUrl" | "apiKey" | "model" | "threshold">;

function headers(settings: Pick<Settings, "apiKey">): Record<string, string> {
  const result: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) result.Authorization = `Bearer ${settings.apiKey}`;
  return result;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const reason = controller.signal.aborted ? "timed out" : error instanceof Error ? error.message : String(error);
    throw new LayaError(`Laya server unreachable at ${url} (${reason})`, true);
  } finally {
    clearTimeout(timer);
  }
}

export async function postSystemOne(settings: LayaSettings, body: LayaRequest): Promise<LayaResponse> {
  const url = `${settings.serverUrl}/v1/systemone`;
  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers: headers(settings), body: JSON.stringify(body) },
    REQUEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LayaError(`Laya error ${response.status}: ${detail.slice(0, 300)}`, false);
  }
  return (await response.json()) as LayaResponse;
}

export interface HealthResult {
  ok: boolean;
  loaded?: string[];
  device?: string;
  error?: string;
}

export async function checkHealth(settings: Pick<Settings, "serverUrl">): Promise<HealthResult> {
  try {
    const response = await fetchWithTimeout(`${settings.serverUrl}/health`, { method: "GET" }, HEALTH_TIMEOUT_MS);
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = (await response.json()) as { loaded?: unknown; device?: unknown };
    return {
      ok: true,
      loaded: Array.isArray(data.loaded) ? data.loaded.map(String) : undefined,
      device: typeof data.device === "string" ? data.device : undefined,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Run `task` over `items` with at most `limit` in flight, keeping order. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * The checkpoint to request. With no explicit model, use the one the server has
 * loaded: letting it auto-route could load a second checkpoint into a small GPU.
 */
export async function resolveModel(settings: LayaSettings): Promise<LayaSettings> {
  if (settings.model) return settings;
  const health = await checkHealth(settings);
  if (!health.ok) throw new LayaError(`Laya server unreachable at ${settings.serverUrl} (${health.error})`, true);
  return { ...settings, model: health.loaded?.[0] ?? "" };
}

export async function classifyFields(settings: LayaSettings, fields: FieldContext[]): Promise<Decision[]> {
  if (fields.length === 0) return [];
  settings = await resolveModel(settings);
  let offlineError: LayaError | null = null;
  const decisions = await mapLimit(fields, CONCURRENCY, async (field): Promise<Decision> => {
    if (offlineError) {
      return { fieldId: field.fieldId, key: null, source: null, confidence: 0, reason: "laya:offline" };
    }
    try {
      const response = await postSystemOne(settings, buildFieldRequest(field, settings.model));
      return parseFieldResponse(field.fieldId, response, settings.threshold);
    } catch (error) {
      if (error instanceof LayaError && error.offline) {
        offlineError = error;
        return { fieldId: field.fieldId, key: null, source: null, confidence: 0, reason: "laya:offline" };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { fieldId: field.fieldId, key: null, source: null, confidence: 0, reason: `laya:error:${message}` };
    }
  });
  if (offlineError && decisions.every((decision) => decision.reason === "laya:offline")) {
    throw offlineError;
  }
  return decisions;
}

export async function matchOption(
  settings: LayaSettings,
  about: string,
  question: string,
  options: string[],
): Promise<{ index: number | null; confidence: number }> {
  settings = await resolveModel(settings);
  const response = await postSystemOne(settings, buildOptionRequest(about, question, options, settings.model));
  return parseOptionResponse(response, settings.threshold);
}
