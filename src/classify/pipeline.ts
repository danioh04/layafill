import { buildContext, collectHeadings } from "../scan/context";
import { findFillableElements, type FillableElement } from "../scan/scanner";
import { isPlaceholderOption } from "../scan/text";
import { assignEntries, type KeyedField } from "../fill/entries";
import { fillCheckbox, fillCombobox, fillSelect, fillText, isCombobox, isEmpty } from "../fill/filler";
import { highlight } from "../fill/highlight";
import { findOption } from "../fill/match-option";
import { valueFor, type FillValue } from "../fill/values";
import { MAX_MATCH_OPTIONS } from "./laya";
import { applyRules } from "./rules";
import type { Decision, FieldContext, FieldDebug, FillStats, Profile, Settings } from "../types";

export interface PipelineDeps {
  profile: Profile;
  settings: Settings;
  /** Classify fields the rules could not place. Throw an error with `offline: true` when Laya is unreachable. */
  classify: (fields: FieldContext[]) => Promise<Decision[]>;
  /** Pick a dropdown option for a value when string matching fails. Null index = no match. */
  matchOption?: (value: string, label: string, options: string[]) => Promise<{ index: number | null }>;
  /** Outline filled / needs-review fields (default on). */
  highlight?: boolean;
}

export interface PipelineResult {
  stats: FillStats;
  debug: FieldDebug[];
}

interface Field {
  element: FillableElement;
  ctx: FieldContext;
  decision: Decision;
}

function isOffline(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { offline?: unknown }).offline === true;
}

/** Stage 1 (rules) and stage 2 (Laya) for every fillable field under `root`. */
export async function classifyPage(
  root: ParentNode,
  deps: Pick<PipelineDeps, "settings" | "classify">,
  skip: (element: FillableElement) => boolean = () => false,
): Promise<{ fields: Field[]; layaOffline: boolean }> {
  const elements = findFillableElements(root);
  const headings = collectHeadings(root);
  const fields: Field[] = elements.map((element, index) => {
    const ctx = buildContext(element, `f${index}`, headings);
    const rule = applyRules(ctx);
    const key = rule?.key ?? null;
    const decision: Decision = {
      fieldId: ctx.fieldId,
      key,
      source: key ? "rule" : null,
      confidence: key ? 1 : 0,
      reason: rule?.reason ?? "unresolved",
    };
    return { element, ctx, decision };
  });

  const unresolved = fields.filter((field) => field.decision.reason === "unresolved" && !skip(field.element));
  let layaOffline = false;
  if (deps.settings.useLaya && unresolved.length > 0) {
    try {
      const decisions = await deps.classify(unresolved.map((field) => field.ctx));
      const byId = new Map(decisions.map((decision) => [decision.fieldId, decision]));
      for (const field of unresolved) {
        field.decision = byId.get(field.ctx.fieldId) ?? field.decision;
      }
    } catch (error) {
      if (!isOffline(error)) throw error;
      layaOffline = true;
    }
  }
  return { fields, layaOffline };
}

function selectableOptions(element: HTMLSelectElement): { index: number; text: string; value: string }[] {
  return Array.from(element.options)
    .map((option, index) => ({ index, text: option.text.replace(/\s+/g, " ").trim(), value: option.value }))
    .filter((option) => !isPlaceholderOption(option.text));
}

async function fillOne(field: Field, value: FillValue, deps: PipelineDeps): Promise<boolean> {
  const { element } = field;
  if (value.kind === "checked") {
    return element instanceof HTMLInputElement && element.type === "checkbox"
      ? fillCheckbox(element, value.checked)
      : false;
  }
  if (element instanceof HTMLInputElement && element.type === "checkbox") return false;

  if (element instanceof HTMLSelectElement) {
    const options = selectableOptions(element);
    const found = findOption(options, [value.text, ...value.alternatives], value.match);
    if (found !== null) return fillSelect(element, options[found].index);
    // Laya only picks among degree levels: for names (schools, majors) it would choose
    // a similar-sounding wrong option, which is worse than leaving the field blank.
    if (deps.matchOption && value.match === "degree" && options.length > 0 && options.length <= MAX_MATCH_OPTIONS) {
      try {
        const { index } = await deps.matchOption(value.text, field.ctx.label ?? "", options.map((o) => o.text));
        if (index !== null && options[index]) return fillSelect(element, options[index].index);
      } catch (error) {
        if (!isOffline(error)) throw error;
      }
    }
    return false;
  }
  if (isCombobox(element)) {
    const candidates = [value.text, ...value.alternatives];
    return fillCombobox(element, value.text, (texts) =>
      findOption(texts.map((text) => ({ text, value: "" })), candidates, value.match),
    );
  }
  return fillText(element, value.text);
}

/** Classify, fill and highlight every field on the page. Never submits anything. */
export async function runFill(root: ParentNode, deps: PipelineDeps): Promise<PipelineResult> {
  const { profile, settings } = deps;
  const skip = (element: FillableElement) => !settings.overwrite && !isEmpty(element);
  const { fields, layaOffline } = await classifyPage(root, deps, skip);

  const keyed: KeyedField[] = fields.flatMap((field) =>
    field.decision.key ? [{ ctx: field.ctx, key: field.decision.key }] : [],
  );
  const entries = assignEntries(keyed);

  let filled = 0;
  let review = 0;
  let total = 0;
  const debug: FieldDebug[] = [];

  for (const field of fields) {
    const { decision, element, ctx } = field;
    const entry = entries.get(ctx.fieldId) ?? null;
    const isOtherCheckbox = decision.reason === "checkbox:other";
    let didFill = false;

    if (!isOtherCheckbox) {
      total += 1;
      const alreadySet = !isEmpty(element);
      if (decision.key && (settings.overwrite || !alreadySet)) {
        const value = valueFor(decision.key, profile, entry ?? 0, ctx);
        if (value) didFill = await fillOne(field, value, deps);
      }
      if (didFill) {
        filled += 1;
        if (deps.highlight !== false) highlight(element, decision.source === "laya" ? "laya" : "rule");
      } else if (!alreadySet && decision.key !== "job_current") {
        review += 1;
        if (deps.highlight !== false) highlight(element, "review");
      }
    }
    debug.push({ context: ctx, decision, entry, filled: didFill });
  }

  return { stats: { filled, review, total, layaOffline }, debug };
}
