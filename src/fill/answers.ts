import { normalize } from "../scan/text";

export type Polarity = "yes" | "no" | "decline";

const DECLINE =
  /\b(decline|declined|prefer not|rather not|choose not|do not wish|don t wish|not wish|do not want to|don t want to|not to (answer|say|disclose|specify|self identify))\b/;
/** Negation inside an option sentence ("I am not a protected veteran"). */
const OPTION_NEGATION = /\b(not|no|never|don t|do not|doesn t|does not|won t|will not|cannot|can t)\b/;
/** Negation in a question ("…authorized to work without sponsorship?") flips what "Yes" means. */
const QUESTION_NEGATION = /\b(not|never|without|don t|do not|won t|will not|cannot|can t|no longer)\b/;

export function isDecline(text: string): boolean {
  return DECLINE.test(normalize(text));
}

/**
 * What an option says. "Yes…"/"No…" options answer the question as asked (prefixed);
 * sentence options ("I will not require sponsorship") state a fact on their own.
 */
export function optionPolarity(option: string): { polarity: Polarity; prefixed: boolean } {
  const text = normalize(option);
  if (DECLINE.test(text)) return { polarity: "decline", prefixed: false };
  if (/^(yes|y|true)\b/.test(text)) return { polarity: "yes", prefixed: true };
  if (/^(no|n|false)\b/.test(text)) return { polarity: "no", prefixed: true };
  return { polarity: OPTION_NEGATION.test(text) ? "no" : "yes", prefixed: false };
}

/** Whether the question's main clause (before the first "?") is negated. */
export function isNegatedQuestion(question: string): boolean {
  const main = question.split("?")[0];
  return QUESTION_NEGATION.test(normalize(main));
}

/**
 * The option that expresses `fact` (the profile's yes/no/decline answer), or null when
 * zero or several options fit and Laya should decide.
 */
export function pickPolarityOption(options: string[], question: string, fact: Polarity): number | null {
  const flipped = fact === "yes" ? "no" : fact === "no" ? "yes" : fact;
  const asked = isNegatedQuestion(question) ? flipped : fact;
  const matches: number[] = [];
  options.forEach((option, index) => {
    const { polarity, prefixed } = optionPolarity(option);
    if (polarity === (prefixed ? asked : fact)) matches.push(index);
  });
  return matches.length === 1 ? matches[0] : null;
}

/** For a single checkbox stating a fact: whether it should be ticked. */
export function checkboxShouldBeChecked(statement: string, fact: Polarity): boolean | null {
  if (fact === "decline") return null;
  return optionPolarity(statement).polarity === fact;
}

const ALIASES: string[][] = [
  ["male", "man"],
  ["female", "woman"],
  ["non binary", "nonbinary", "genderqueer"],
  ["black", "african american"],
];

function words(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

/** The one option containing every word of the answer (or of one of its aliases), e.g. "Asian" in "Asian (Not Hispanic or Latino)". */
export function pickContainingOption(options: string[], answer: string): number | null {
  const simple = normalize(answer);
  const variants = [simple, ...(ALIASES.find((group) => group.includes(simple)) ?? [])];
  const exact = options.findIndex((option) => variants.includes(normalize(option)));
  if (exact >= 0) return exact;
  const matches = options
    .map((option, index) => ({ index, optionWords: words(option) }))
    .filter(({ optionWords }) => variants.some((variant) => [...words(variant)].every((word) => optionWords.has(word))));
  return matches.length === 1 ? matches[0].index : null;
}
