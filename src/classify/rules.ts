import type { FieldContext, FieldKey } from "../types";
import { normalize } from "../scan/text";

export type SectionKind = "education" | "experience" | null;

/** Outcome of the rules stage: a key, a deliberate skip, or undefined when Laya should decide. */
export type RuleResult = { key: FieldKey | null; reason: string } | undefined;

/** Fields that are never filled from the profile (essays, demographics, legal, salary...). */
const IGNORE =
  /\b(salary|compensation|pay|cover letter|sponsor\w*|authori[sz]\w*|visa|citizen\w*|gender|sex|race|racial|ethnic\w*|veteran|disabilit\w*|hispanic|latin[oax]|pronouns?|hear about|how did you (hear|find|learn)|referr\w*|referral|captcha|search|password|signature|other (website|url|link|site)s?|additional (website|url|link|site)s?|today s date|todays date|birth\w*|ssn|social security|relocat\w*|notice period|availab\w*|desired|expected (salary|compensation)|twitter|facebook|instagram|reference|emergency|supervisor|recruiter|comments?|anything else|additional information|message|(phone|device) type|country (code|dial)|dial code|extension)\b|^why\b|\bwhy (do|are|would|did|is)\b/;

/** Text-match rules in priority order. A key function returning null means "let Laya decide". */
interface TextRule {
  name: string;
  pattern: RegExp;
  not?: RegExp;
  key: FieldKey | ((section: SectionKind) => FieldKey | null);
}

const LOCATION =
  /\bcity\b.*\bstate\b|\blocation\b|\bwhere (are )?you (currently )?(located|based|live)\b|\bcurrent(ly)? (city|location)\b|\bbased in\b/;

const TEXT_RULES: TextRule[] = [
  { name: "linkedin", pattern: /\blinked ?in\b/, key: "linkedin" },
  { name: "github", pattern: /\bgit ?hub\b/, key: "github" },
  { name: "email", pattern: /\be ?mail\b/, key: "email" },
  {
    name: "phone",
    pattern: /\b(phone|mobile|cell|telephone)\b/,
    not: /\b(type|device|extension|ext)\b|^(phone )?country( code)?\b|\bcountry code$/,
    key: "phone",
  },
  { name: "preferred_name", pattern: /\b(preferred|nick) ?(first )?name\b|\bnickname\b/, key: "preferred_name" },
  { name: "middle_name", pattern: /\bmiddle (name|initial)s?\b|\bmname\b/, key: "middle_name" },
  { name: "first_name", pattern: /\b(first|given|fore) ?name\b|\bfname\b/, key: "first_name" },
  { name: "last_name", pattern: /\b(last|family|sur) ?name\b|\bsurname\b|\blname\b/, key: "last_name" },
  {
    name: "school",
    pattern: /\b(school|university|college|institution|alma mater)\b/,
    not: /\bhigh school (diploma|graduate)\b|\b(location|city|state|country|website)\b/,
    key: "school",
  },
  {
    name: "major",
    pattern:
      /\b(major|field of study|area of study|discipline|concentration|specialization|course of study|program of study)\b/,
    key: "major",
  },
  { name: "degree", pattern: /\bdegree\b|\bqualification\b/, key: "degree" },
  { name: "gpa", pattern: /\b(c?gpa|grade point|grade average)\b/, key: "gpa" },
  {
    name: "company",
    pattern: /\b(company|employer|organi[sz]ation|firm)\b/,
    not: /\b(website|url|size|industry|this company|our company|location|city|state|country)\b/,
    key: "company",
  },
  {
    name: "job_title",
    pattern: /\b(job |current |position |role )?title\b|\bposition\b|\bjob role\b/,
    not: /\b(apply|applying|thesis|project)\b/,
    key: "job_title",
  },
  {
    name: "job_description",
    pattern: /\b(description|responsibilit\w*|duties|accomplishments?|achievements?|summary)\b/,
    key: (section) => (section === "experience" ? "job_description" : null),
  },
  {
    name: "portfolio",
    pattern: /\b(portfolio|personal (web ?)?site|website|web site|blog|homepage|personal url|url)\b/,
    key: "portfolio",
  },
  { name: "address_line2", pattern: /\baddress (line )?2\b|\b(apt|apartment|suite|unit)\b/, key: "address_line2" },
  { name: "address_line1", pattern: /\b(street|address)\b/, not: /\b(e ?mail|ip|web)\b/, key: "address_line1" },
  { name: "postal_code", pattern: /\b(zip|postal|post ?code|zipcode)\b/, key: "postal_code" },
  { name: "job_location", pattern: /\b(company|employer|job|work|office) location\b/, key: "job_location" },
  { name: "location", pattern: LOCATION, key: (section) => (section === "experience" ? "job_location" : "location") },
  { name: "city", pattern: /\b(city|town)\b/, key: "city" },
  {
    name: "state",
    pattern: /\b(state|province|region)\b/,
    not: /\bunited states\b|\bstatement\b|\bstate (your|the|why|how|any|if)\b/,
    key: "state",
  },
  { name: "country", pattern: /\bcountry\b/, not: /\b(code|phone|citizenship)\b/, key: "country" },
  {
    name: "full_name",
    pattern: /^((your|full|legal|applicant|candidate) )*name$|\bfull name\b|\blegal name\b|\byour name\b/,
    key: (section) => (section ? null : "full_name"),
  },
];

/** Attribute-only rules for common ATS naming conventions (checked after TEXT_RULES on attributes). */
const ATTR_RULES: TextRule[] = [
  { name: "org", pattern: /^(current )?org$/, key: "company" },
  { name: "name", pattern: /(^| )name$/, key: (section) => (section ? null : "full_name") },
];

const ALL_RULES = [...TEXT_RULES, ...ATTR_RULES];

const AUTOCOMPLETE: Record<string, FieldKey> = {
  "given-name": "first_name",
  "additional-name": "middle_name",
  "family-name": "last_name",
  name: "full_name",
  nickname: "preferred_name",
  email: "email",
  tel: "phone",
  "tel-national": "phone",
  "street-address": "address_line1",
  "address-line1": "address_line1",
  "address-line2": "address_line2",
  "address-level2": "city",
  "address-level1": "state",
  "postal-code": "postal_code",
  country: "country",
  "country-name": "country",
  organization: "company",
  "organization-title": "job_title",
};

const DATE_WORD = /\b(date|dates|day|dd|month|year|mm|yyyy|yy|graduat\w*|attended|period)\b/;
const BARE_DATE_LABEL = /^(from|to|start|end)( date)?$/;
const START = /\b(start|from|begin|began|beginning|commenced?)\w*|\bfirst year\b/;
const END = /\b(end|ended|to|until|through|graduat\w*|finish\w*|completion|complete|expected)\b|\blast year\b/;
const MONTH_OPTION = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$|^(0?[1-9]|1[0-2])$/i;
const YEAR_OPTION = /^(19|20)\d{2}$/;
const CURRENT_JOB =
  /\b(currently|still) (work|employed|working)\b|\bi (currently )?work here\b|\bcurrent (job|role|position|employer)\b|\bpresent\b/;

function textSources(ctx: FieldContext): string[] {
  const primary = normalize(ctx.label || ctx.ariaLabel || ctx.nearbyText);
  const placeholder = normalize(ctx.placeholder);
  return [primary, placeholder].filter(Boolean);
}

/** Workday prefixes ids with their section ("addressSection_city"); keep only what follows. */
function stripSectionPrefix(text: string): string {
  return text.replace(/^.*\bsection\s+/, "");
}

function attrParts(ctx: FieldContext): string[] {
  return [ctx.automationId, ctx.name, ctx.id]
    .map((value) => stripSectionPrefix(normalize(value)))
    .filter(Boolean);
}

function groupParts(ctx: FieldContext): string[] {
  return (ctx.groupHint ?? "")
    .split(" | ")
    .map((part) => normalize(part))
    .filter(Boolean);
}

/** Whether the field sits in an Education or Experience block (innermost ancestor hint wins). */
export function sectionKind(ctx: FieldContext): SectionKind {
  const detect = (text: string): SectionKind => {
    if (/\b(education|school|academic|degree|universit\w*)\b/.test(text)) return "education";
    if (/\b(experience|employment|work history|job history|work \d|job \d|position \d|employer)\b/.test(text)) {
      return "experience";
    }
    return null;
  };
  for (const part of groupParts(ctx)) {
    const kind = detect(part);
    if (kind) return kind;
  }
  return detect(normalize(ctx.section));
}

function applyRule(rule: TextRule, text: string, section: SectionKind): RuleResult {
  if (!rule.pattern.test(text) || rule.not?.test(text)) return undefined;
  const key = typeof rule.key === "function" ? rule.key(section) : rule.key;
  return key ? { key, reason: rule.name } : undefined;
}

export function isMonthOrYearSelect(options: string[] | undefined): "month" | "year" | null {
  if (!options || options.length < 5) return null;
  const months = options.filter((option) => MONTH_OPTION.test(option)).length;
  const years = options.filter((option) => YEAR_OPTION.test(option)).length;
  if (months >= options.length * 0.8) return "month";
  if (years >= options.length * 0.8) return "year";
  return null;
}

function dateRule(ctx: FieldContext, section: SectionKind): RuleResult {
  const label = normalize([ctx.label || ctx.ariaLabel, ctx.placeholder].filter(Boolean).join(" "));
  const nearby = normalize(ctx.nearbyText);
  const looksLikeDate =
    ctx.inputType === "month" ||
    ctx.inputType === "date" ||
    DATE_WORD.test(label) ||
    BARE_DATE_LABEL.test(label) ||
    (!label && (DATE_WORD.test(nearby) || BARE_DATE_LABEL.test(nearby))) ||
    isMonthOrYearSelect(ctx.options) !== null;
  if (!looksLikeDate) return undefined;

  const directionSources = [label, nearby, ...groupParts(ctx), ...attrParts(ctx)].filter(Boolean);
  if (directionSources.some((text) => /\bgraduat\w*/.test(text))) {
    return { key: "edu_end", reason: "date:graduation" };
  }

  let direction: "start" | "end" | null = null;
  for (const text of directionSources) {
    if (START.test(text)) {
      direction = "start";
      break;
    }
    if (END.test(text)) {
      direction = "end";
      break;
    }
  }
  if (!direction || !section) return undefined;
  if (section === "education") {
    return { key: direction === "start" ? "edu_start" : "edu_end", reason: `date:education:${direction}` };
  }
  return { key: direction === "start" ? "job_start" : "job_end", reason: `date:experience:${direction}` };
}

function checkboxRule(ctx: FieldContext, section: SectionKind): RuleResult {
  const texts = [normalize(ctx.label || ctx.ariaLabel || ctx.nearbyText), ...attrParts(ctx)];
  if (section !== "education" && texts.some((text) => CURRENT_JOB.test(text))) {
    return { key: "job_current", reason: "checkbox:current" };
  }
  // Consent boxes and other checkboxes are never touched.
  return { key: null, reason: "checkbox:other" };
}

const YES_NO_OPTION = /^(yes|no|y|n|true|false|i do|i do not|i don t|prefer not to (say|answer)|decline to answer|n a)\b/i;

/** Dropdowns whose options are all yes/no answers ask a question, not for a profile value. */
function isYesNoSelect(ctx: FieldContext): boolean {
  const options = ctx.options ?? [];
  return options.length > 0 && options.length <= 4 && options.every((option) => YES_NO_OPTION.test(option.trim()));
}

export function applyRules(ctx: FieldContext): RuleResult {
  const section = sectionKind(ctx);

  if (ctx.inputType === "checkbox") {
    return checkboxRule(ctx, section);
  }
  if (isYesNoSelect(ctx)) {
    return { key: null, reason: "yes-no-question" };
  }

  const sources = textSources(ctx);
  if (sources.some((text) => IGNORE.test(text))) {
    return { key: null, reason: "ignored" };
  }

  if (ctx.autocomplete) {
    for (const token of ctx.autocomplete.split(/\s+/).reverse()) {
      const key = AUTOCOMPLETE[token];
      if (key) return { key, reason: `autocomplete:${token}` };
    }
  }

  const date = dateRule(ctx, section);
  if (date) return date;

  for (const text of sources) {
    for (const rule of TEXT_RULES) {
      const result = applyRule(rule, text, section);
      if (result) return result;
    }
  }

  if (ctx.inputType === "email") return { key: "email", reason: "type:email" };
  if (ctx.inputType === "tel") return { key: "phone", reason: "type:tel" };

  // Only trust attributes when there is no visible text to go on, or it matched nothing.
  for (const part of attrParts(ctx)) {
    if (IGNORE.test(part)) return { key: null, reason: "ignored:attr" };
    for (const rule of ALL_RULES) {
      const result = applyRule(rule, part, section);
      if (result) return { ...result, reason: `attr:${result.reason}` };
    }
  }

  // Unplaced text areas are essay questions; every key Laya can pick is a one-line value.
  if (ctx.tag === "textarea") return { key: null, reason: "textarea:essay" };

  return undefined;
}
