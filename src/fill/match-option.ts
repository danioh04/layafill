import { isPlaceholderOption } from "../scan/text";
import { countryAliases, degreeLevel, simplify, stateAliases } from "./synonyms";

export type MatchKind = "state" | "country" | "degree" | "plain";

export interface OptionLike {
  text: string;
  value: string;
}

const MIN_SCORE = 0.75;

/**
 * Words that many different options share. Without them "Georgia Institute of
 * Technology" scored 0.75 against "Massachusetts Institute of Technology".
 */
const GENERIC = new Set([
  "of",
  "the",
  "and",
  "at",
  "in",
  "for",
  "de",
  "university",
  "college",
  "institute",
  "school",
  "technology",
  "state",
  "community",
  "polytechnic",
  "academy",
  "campus",
]);

function tokens(text: string): Set<string> {
  return new Set(simplify(text).split(" ").filter((token) => token.length > 1 || /\d/.test(token)));
}

/** Distinctive tokens; falls back to all tokens when a text is nothing but generic words. */
function keyTokens(text: string): Set<string> {
  const all = tokens(text);
  const distinctive = new Set([...all].filter((token) => !GENERIC.has(token)));
  return distinctive.size > 0 ? distinctive : all;
}

/** Share of distinctive tokens the two texts have in common (relative to the larger set). */
function overlap(a: string, b: string): number {
  const ta = keyTokens(a);
  const tb = keyTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return shared / Math.max(ta.size, tb.size);
}

function aliasesFor(candidate: string, kind: MatchKind): string[] {
  if (kind === "state") return stateAliases(candidate);
  if (kind === "country") return countryAliases(candidate);
  return [simplify(candidate)];
}

function score(option: OptionLike, candidates: string[], kind: MatchKind): number {
  const text = simplify(option.text);
  const value = simplify(option.value);
  if (!text || isPlaceholderOption(option.text)) return 0;

  let best = 0;
  for (const candidate of candidates) {
    const aliases = aliasesFor(candidate, kind);
    if (aliases.includes(text) || (value && aliases.includes(value))) return 1;

    if (kind === "degree") {
      const wanted = degreeLevel(candidate);
      if (wanted && degreeLevel(option.text) === wanted) {
        // Same level; prefer the option naming the same field ("Bachelor of Science" over "... of Arts").
        best = Math.max(best, 0.8 + 0.2 * overlap(candidate, option.text));
        continue;
      }
    }
    const simpleCandidate = simplify(candidate);
    if (simpleCandidate.length >= 4 && (text.startsWith(simpleCandidate) || simpleCandidate.startsWith(text))) {
      best = Math.max(best, 0.85);
    }
    best = Math.max(best, overlap(candidate, option.text));
    // "May" in "05 - May": every candidate token present, at most one extra token.
    const candidateTokens = keyTokens(candidate);
    const optionTokens = keyTokens(option.text);
    if (
      candidateTokens.size > 0 &&
      [...candidateTokens].every((token) => optionTokens.has(token)) &&
      optionTokens.size <= candidateTokens.size + 1
    ) {
      best = Math.max(best, 0.8);
    }
  }
  return best;
}

/**
 * Index of the option that best matches any candidate value, or null when none is
 * close enough. Candidates are alternative spellings of one value ("May", "05", "5").
 */
export function findOption(options: OptionLike[], candidates: string[], kind: MatchKind = "plain"): number | null {
  let bestIndex: number | null = null;
  let bestScore = 0;
  options.forEach((option, index) => {
    const s = score(option, candidates.filter(Boolean), kind);
    if (s > bestScore) {
      bestScore = s;
      bestIndex = index;
    }
  });
  return bestScore >= MIN_SCORE ? bestIndex : null;
}
