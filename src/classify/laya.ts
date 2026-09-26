import { KEYS, LAYA_ANSWER_KEYS, LAYA_KEYS, OTHER_ANSWER_DESCRIPTION, OTHER_DESCRIPTION } from "../profile/keys";
import { isYesNoOptions } from "./rules";
import { normalize } from "../scan/text";
import type { Decision, FieldContext, FieldKey } from "../types";

export interface LayaChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface LayaRequest {
  model?: string;
  state: string;
  questions: Record<string, LayaChoiceQuestion>;
}

export interface LayaChoiceAnswer {
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface LayaResponse {
  answers?: Record<string, LayaChoiceAnswer>;
}

const MAX_STATE_CHARS = 1100;
const MAX_STATE_OPTIONS = 10;
/** Choice questions above this many options get trimmed by Laya's ~192-token option budget. */
export const MAX_MATCH_OPTIONS = 16;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Describe one field as Laya's `state`. Only page text goes here, never profile values. */
export function buildFieldState(ctx: FieldContext): string {
  const lines = ["A form field on a job application."];
  const add = (name: string, value: string | undefined, max = 160) => {
    if (value) lines.push(`${name}: ${clip(value, max)}`);
  };

  add("Label", ctx.label);
  if (ctx.ariaLabel !== ctx.label) add("Aria label", ctx.ariaLabel);
  add("Placeholder", ctx.placeholder);
  add("Section", ctx.section, 100);
  if (ctx.nearbyText !== ctx.label) add("Text before the field", ctx.nearbyText, 200);

  const attrs = [ctx.automationId, ctx.name, ctx.id].map((value) => normalize(value)).filter(Boolean);
  add("Field name", [...new Set(attrs)].join(", "), 120);
  add("Container", ctx.groupHint, 120);
  lines.push(`Field type: ${ctx.tag}${ctx.inputType && ctx.inputType !== "text" ? ` (${ctx.inputType})` : ""}`);
  if (ctx.options?.length) {
    const shown = ctx.options.slice(0, MAX_STATE_OPTIONS).join("; ");
    add("Choices", ctx.options.length > MAX_STATE_OPTIONS ? `${shown}; …` : shown, 240);
  }
  return clip(lines.join("\n"), MAX_STATE_CHARS);
}

function choiceQuestion(instructions: string, keys: FieldKey[], other: string): LayaChoiceQuestion {
  const criteria: Record<string, string> = Object.fromEntries(keys.map((key) => [key, KEYS[key].description]));
  criteria.other = other;
  return { type: "choice", instructions, criteria };
}

/**
 * Two choice questions answered in one pass: which profile detail the field asks for,
 * and which application question it is. Yes/no fields only get the second.
 */
export function buildFieldQuestions(ctx?: FieldContext): Record<string, LayaChoiceQuestion> {
  const question = choiceQuestion(
    "Which application question is this?",
    LAYA_ANSWER_KEYS,
    OTHER_ANSWER_DESCRIPTION,
  );
  if (ctx && isYesNoOptions(ctx.options)) return { question };
  return {
    field: choiceQuestion("What does this job application form field ask for?", LAYA_KEYS, OTHER_DESCRIPTION),
    question,
  };
}

export function buildFieldRequest(ctx: FieldContext, model: string): LayaRequest {
  const request: LayaRequest = { state: buildFieldState(ctx), questions: buildFieldQuestions(ctx) };
  if (model) request.model = model;
  return request;
}

/** The chosen label and its probability (falls back to `confidence` when no distribution is given). */
export function topChoice(answer: LayaChoiceAnswer | undefined): { choice: string | null; probability: number } {
  if (!answer) return { choice: null, probability: 0 };
  if (answer.probabilities && Object.keys(answer.probabilities).length > 0) {
    let best: string | null = null;
    let bestProbability = -1;
    for (const [label, probability] of Object.entries(answer.probabilities)) {
      if (probability > bestProbability) {
        best = label;
        bestProbability = probability;
      }
    }
    return { choice: best, probability: Math.max(bestProbability, 0) };
  }
  return { choice: answer.choice ?? null, probability: answer.confidence ?? 0 };
}

export function parseFieldResponse(
  fieldId: string,
  response: LayaResponse,
  threshold: number,
): Decision {
  const answers = response.answers ?? {};
  // The more confident of the two questions wins, ignoring "other" and unknown labels.
  const candidates = [
    { ...topChoice(answers.field), allowed: LAYA_KEYS },
    { ...topChoice(answers.question), allowed: LAYA_ANSWER_KEYS },
  ]
    .filter((c) => c.choice && c.choice !== "other" && (c.allowed as string[]).includes(c.choice))
    .sort((a, b) => b.probability - a.probability);
  const best = candidates[0];
  const none = (reason: string, confidence = 0): Decision => ({ fieldId, key: null, source: "laya", confidence, reason });

  if (!answers.field && !answers.question) return none("laya:no-answer");
  if (!best) return none("laya:other");
  if (best.probability < threshold) return none(`laya:unsure:${best.choice}`, best.probability);
  return {
    fieldId,
    key: best.choice as FieldKey,
    source: "laya",
    confidence: best.probability,
    reason: `laya:${best.choice}`,
  };
}

/** Ask which option fits a sentence about the applicant ("The applicant is not a protected veteran."). */
export function buildOptionRequest(about: string, question: string, options: string[], model: string): LayaRequest {
  const criteria: Record<string, string> = {};
  options.forEach((option, index) => {
    criteria[`o${index}`] = clip(option, 80);
  });
  criteria.none = "none of these options fit";
  const request: LayaRequest = {
    state: clip(`A job application question${question ? `: "${question}"` : ""}.\n${about}`, 600),
    questions: {
      option: {
        type: "choice",
        instructions: "Which option should the applicant choose?",
        criteria,
      },
    },
  };
  if (model) request.model = model;
  return request;
}

export function parseOptionResponse(
  response: LayaResponse,
  threshold: number,
): { index: number | null; confidence: number } {
  const { choice, probability } = topChoice(response.answers?.option);
  if (!choice || choice === "none" || probability < threshold) {
    return { index: null, confidence: probability };
  }
  const index = Number.parseInt(choice.slice(1), 10);
  return Number.isNaN(index) ? { index: null, confidence: probability } : { index, confidence: probability };
}
