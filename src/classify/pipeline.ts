import { buildContext, buildGroupContext, collectHeadings } from "../scan/context";
import { findFillTargets, targetElement, type FillTarget } from "../scan/scanner";
import { isPlaceholderOption } from "../scan/text";
import { checkboxShouldBeChecked, isNegatedQuestion, pickContainingOption, pickPolarityOption } from "../fill/answers";
import { assignEntries, type KeyedField } from "../fill/entries";
import { fillCheckbox, fillChoice, fillCombobox, fillSelect, fillText, isCombobox, isEmpty } from "../fill/filler";
import { highlight } from "../fill/highlight";
import { findOption } from "../fill/match-option";
import { attachResume, findResumeInputs } from "../fill/resume-attach";
import { valueFor, type FillValue } from "../fill/values";
import { MAX_MATCH_OPTIONS } from "./laya";
import { applyRules } from "./rules";
import type { Decision, FieldContext, FieldDebug, FillStats, Profile, Settings } from "../types";

export interface PipelineDeps {
  profile: Profile;
  settings: Settings;
  /** Classify fields the rules could not place. Throw an error with `offline: true` when Laya is unreachable. */
  classify: (fields: FieldContext[]) => Promise<Decision[]>;
  /** Ask Laya which option fits a sentence about the applicant. Null index = none. */
  matchOption?: (about: string, question: string, options: string[]) => Promise<{ index: number | null }>;
  /** The saved resume, attached to resume upload fields before anything else. */
  getResume?: () => Promise<File | null>;
  /** How long to let the site read an attached resume before filling (default 3 s). */
  resumeWaitMs?: number;
  /** Outline filled / needs-review fields (default on). */
  highlight?: boolean;
}

export interface PipelineResult {
  stats: FillStats;
  debug: FieldDebug[];
}

interface Field {
  target: FillTarget;
  ctx: FieldContext;
  decision: Decision;
}

/** An option the user can pick: its text, and how to select it. */
interface Choice {
  text: string;
  select: () => boolean;
}

const RESUME_WAIT_MS = 3000;

function isOffline(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { offline?: unknown }).offline === true;
}

function isTargetEmpty(target: FillTarget): boolean {
  return target.kind === "group" ? !target.inputs.some((input) => input.checked) : isEmpty(target.element);
}

/** Stage 1 (rules) and stage 2 (Laya) for every fillable field under `root`. */
export async function classifyPage(
  root: ParentNode,
  deps: Pick<PipelineDeps, "settings" | "classify">,
  skip: (target: FillTarget) => boolean = () => false,
): Promise<{ fields: Field[]; layaOffline: boolean }> {
  const headings = collectHeadings(root);
  const fields: Field[] = findFillTargets(root).map((target, index) => {
    const fieldId = `f${index}`;
    const ctx =
      target.kind === "group" ? buildGroupContext(target, fieldId, headings) : buildContext(target.element, fieldId, headings);
    const rule = applyRules(ctx);
    const key = rule?.key ?? null;
    const decision: Decision = {
      fieldId,
      key,
      source: key ? "rule" : null,
      confidence: key ? 1 : 0,
      reason: rule?.reason ?? "unresolved",
    };
    return { target, ctx, decision };
  });

  const unresolved = fields.filter((field) => field.decision.reason === "unresolved" && !skip(field.target));
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

/** The options of a dropdown or radio/checkbox group, placeholders removed; null for other fields. */
function choicesOf(field: Field): Choice[] | null {
  const { target } = field;
  if (target.kind === "group") {
    return target.inputs.map((input, index) => ({
      text: field.ctx.options?.[index] ?? input.value,
      select: () => fillChoice(input),
    }));
  }
  if (target.element instanceof HTMLSelectElement) {
    const select = target.element;
    return Array.from(select.options)
      .map((option, index) => ({ text: option.text.replace(/\s+/g, " ").trim(), select: () => fillSelect(select, index) }))
      .filter((choice) => !isPlaceholderOption(choice.text));
  }
  return null;
}

/** Laya reads the options for meaning; used where text matching cannot decide. */
async function askLaya(field: Field, choices: Choice[], about: string, deps: PipelineDeps): Promise<boolean> {
  if (!deps.matchOption || choices.length === 0 || choices.length > MAX_MATCH_OPTIONS) return false;
  try {
    const { index } = await deps.matchOption(about, field.ctx.label ?? "", choices.map((choice) => choice.text));
    return index !== null && choices[index] ? choices[index].select() : false;
  } catch (error) {
    if (!isOffline(error)) throw error;
    return false;
  }
}

async function fillAnswer(field: Field, value: Extract<FillValue, { kind: "answer" }>, deps: PipelineDeps): Promise<boolean> {
  const question = field.ctx.label ?? "";
  const choices = choicesOf(field);
  if (choices) {
    const texts = choices.map((choice) => choice.text);
    const index = value.fact
      ? pickPolarityOption(texts, question, value.fact)
      : (pickContainingOption(texts, value.text) ?? findOption(texts.map((text) => ({ text, value: "" })), [value.text]));
    if (index !== null) return choices[index].select();
    return askLaya(field, choices, value.statement, deps);
  }

  const { target } = field;
  if (target.kind !== "element") return false;
  const { element } = target;
  if (element instanceof HTMLInputElement && element.type === "checkbox") {
    const checked = value.fact ? checkboxShouldBeChecked(question, value.fact) : null;
    return checked === null ? false : fillCheckbox(element, checked);
  }
  if (value.fact === "decline" && !value.text) return false;
  // A typed "Yes"/"No" answers the question as asked, so negated questions flip it.
  let typed = value.text;
  if (value.fact === "yes" || value.fact === "no") {
    const yes = (value.fact === "yes") !== isNegatedQuestion(question);
    typed = yes ? "Yes" : "No";
  }
  if (isCombobox(element)) {
    return fillCombobox(element, typed, (texts) => pickContainingOption(texts, typed));
  }
  return element instanceof HTMLSelectElement ? false : fillText(element, typed);
}

async function fillOne(field: Field, value: FillValue, deps: PipelineDeps): Promise<boolean> {
  if (value.kind === "answer") return fillAnswer(field, value, deps);

  const { target } = field;
  if (value.kind === "checked") {
    return target.kind === "element" && target.element instanceof HTMLInputElement && target.element.type === "checkbox"
      ? fillCheckbox(target.element, value.checked)
      : false;
  }

  const choices = choicesOf(field);
  if (choices) {
    const found = findOption(
      choices.map((choice) => ({ text: choice.text, value: "" })),
      [value.text, ...value.alternatives],
      value.match,
    );
    if (found !== null) return choices[found].select();
    // Laya only picks among degree levels: for names (schools, majors) it would choose
    // a similar-sounding wrong option, which is worse than leaving the field blank.
    return value.match === "degree" ? askLaya(field, choices, `The applicant's degree is ${value.text}.`, deps) : false;
  }

  if (target.kind !== "element") return false;
  const { element } = target;
  if (element instanceof HTMLInputElement && element.type === "checkbox") return false;
  if (element instanceof HTMLSelectElement) return false;
  if (isCombobox(element)) {
    const candidates = [value.text, ...value.alternatives];
    return fillCombobox(element, value.text, (texts) =>
      findOption(texts.map((text) => ({ text, value: "" })), candidates, value.match),
    );
  }
  return fillText(element, value.text);
}

/** Attach the resume, classify, fill and outline every field on the page. Never submits anything. */
export async function runFill(root: ParentNode, deps: PipelineDeps): Promise<PipelineResult> {
  const { profile, settings } = deps;

  const resumeInputs = deps.getResume ? findResumeInputs(root) : [];
  const resume = resumeInputs.length > 0 && deps.getResume ? await deps.getResume() : null;
  const resumeAttached = resume ? attachResume(resumeInputs, resume) : false;
  if (resumeAttached) {
    // Let the site parse the resume and prefill what it can; those values are then kept.
    await new Promise((resolve) => setTimeout(resolve, deps.resumeWaitMs ?? RESUME_WAIT_MS));
  }

  const skip = (target: FillTarget) => !settings.overwrite && !isTargetEmpty(target);
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
    const { decision, target, ctx } = field;
    const element = targetElement(target);
    const entry = entries.get(ctx.fieldId) ?? null;
    let didFill = false;

    // Consent boxes and other lone checkboxes are neither filled nor counted.
    if (decision.reason !== "checkbox:other") {
      total += 1;
      const alreadySet = !isTargetEmpty(target);
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

  return { stats: { filled, review, total, layaOffline, resumeAttached }, debug };
}
