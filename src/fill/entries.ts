import { isEntryCategory, KEYS } from "../profile/keys";
import { normalize } from "../scan/text";
import type { FieldContext, FieldKey } from "../types";
import { datePart } from "./values";

export interface KeyedField {
  ctx: FieldContext;
  key: FieldKey;
}

const NUMBERED = /\b(experience|education|employment|job|work|position|school|degree)s?\s*(\d{1,2})\b/;

/** Explicit entry number from ancestor ids such as Workday's "workExperience-2". */
function explicitNumber(ctx: FieldContext): number | null {
  for (const part of (ctx.groupHint ?? "").split(" | ")) {
    const match = NUMBERED.exec(normalize(part));
    if (match) return Number(match[2]);
  }
  return null;
}

/** Identity of a field within one entry: start month and start year are different slots. */
function slot(field: KeyedField): string {
  const { key, ctx } = field;
  return /_(start|end)$/.test(key) ? `${key}:${datePart(ctx)}` : key;
}

/**
 * Entry index (0 = first education / first job in the profile) for every
 * education and experience field. Uses explicit numbering when every field in
 * a category has it; otherwise walks in document order and starts a new entry
 * when a slot repeats.
 */
export function assignEntries(fields: KeyedField[]): Map<string, number> {
  const result = new Map<string, number>();

  for (const category of ["education", "experience"] as const) {
    const inCategory = fields.filter((field) => {
      const info = KEYS[field.key];
      return isEntryCategory(info.category) && info.category === category;
    });
    if (inCategory.length === 0) continue;

    const numbers = inCategory.map((field) => explicitNumber(field.ctx));
    if (numbers.every((n) => n !== null)) {
      const ordered = [...new Set(numbers as number[])].sort((a, b) => a - b);
      inCategory.forEach((field, index) => {
        result.set(field.ctx.fieldId, ordered.indexOf(numbers[index] as number));
      });
      continue;
    }

    let entry = 0;
    let seen = new Set<string>();
    for (const field of inCategory) {
      const id = slot(field);
      if (seen.has(id)) {
        entry += 1;
        seen = new Set();
      }
      seen.add(id);
      result.set(field.ctx.fieldId, entry);
    }
  }
  return result;
}
