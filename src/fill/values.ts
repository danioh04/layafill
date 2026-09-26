import { isMonthOrYearSelect } from "../classify/rules";
import { MONTH_NAMES } from "../profile/profile";
import { normalize } from "../scan/text";
import type { DateString, FieldContext, FieldKey, Profile } from "../types";
import type { MatchKind } from "./match-option";
import { stateAbbreviation, stateName } from "./synonyms";

export type FillValue =
  | {
      kind: "text";
      /** What to type into a text field. */
      text: string;
      /** Extra spellings tried when matching dropdown options. */
      alternatives: string[];
      match: MatchKind;
    }
  | { kind: "checked"; checked: boolean };

function text(value: string, alternatives: string[] = [], match: MatchKind = "plain"): FillValue | null {
  const trimmed = value.trim();
  return trimmed ? { kind: "text", text: trimmed, alternatives, match } : null;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export type DatePart = "day" | "month" | "year" | "full";

export function datePart(ctx: FieldContext): DatePart {
  const selectPart = isMonthOrYearSelect(ctx.options);
  if (selectPart) return selectPart;
  if (ctx.inputType === "month" || ctx.inputType === "date") return "full";
  const words = normalize([ctx.label, ctx.ariaLabel, ctx.placeholder, ctx.automationId, ctx.name, ctx.id].join(" "));
  const day = /\b(day|dd)\b/.test(words);
  const month = /\b(month|mm)\b/.test(words);
  const year = /\b(year|yyyy|yy)\b/.test(words);
  if (day && !month && !year) return "day";
  if (month && !year && !day) return "month";
  if (year && !month && !day) return "year";
  return "full";
}

/**
 * Format a profile date ("YYYY-MM-DD", or "YYYY-MM" when the day is unknown) the way
 * the field expects. Month/year fields never show the day; full-date fields use the
 * profile's day, or the 1st when the profile has none.
 */
export function formatDate(date: DateString, ctx: FieldContext): FillValue | null {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!match) return null;
  const [, year, mm, day] = match;
  const dd = day ?? "01";
  const monthIndex = Number(mm) - 1;
  const name = capitalize(MONTH_NAMES[monthIndex]);
  const part = datePart(ctx);

  if (part === "day") return text(ctx.tag === "select" ? String(Number(dd)) : dd, [dd, String(Number(dd))]);
  if (part === "month") {
    return text(ctx.tag === "select" ? name : mm, [name, name.slice(0, 3), mm, String(monthIndex + 1)]);
  }
  if (part === "year") return text(year, [year.slice(2)]);
  if (ctx.inputType === "month") return text(`${year}-${mm}`);
  if (ctx.inputType === "date") return text(`${year}-${mm}-${dd}`);

  const placeholder = (ctx.placeholder ?? "").toUpperCase().replace(/\s+/g, "");
  if (/^MM\/DD\/YYYY$/.test(placeholder)) return text(`${mm}/${dd}/${year}`);
  if (/^DD\/MM\/YYYY$/.test(placeholder)) return text(`${dd}/${mm}/${year}`);
  if (/^YYYY-MM-DD$/.test(placeholder)) return text(`${year}-${mm}-${dd}`);
  if (/^YYYY-MM$/.test(placeholder)) return text(`${year}-${mm}`);
  if (/^MM\/YY$/.test(placeholder)) return text(`${mm}/${year.slice(2)}`);
  if (/^MM-YYYY$/.test(placeholder)) return text(`${mm}-${year}`);
  if (/MONTH/.test(placeholder) || ctx.tag === "select") return text(`${name} ${year}`, [`${mm}/${year}`]);
  return text(`${mm}/${year}`, [`${name} ${year}`]);
}

function formatPhone(phone: string, ctx: FieldContext): FillValue | null {
  const digits = phone.replace(/\D/g, "");
  if (ctx.maxLength && ctx.maxLength <= 10 && digits.length === 11 && digits.startsWith("1")) {
    return text(digits.slice(1));
  }
  if (ctx.maxLength && ctx.maxLength < phone.length) return text(digits);
  return text(phone);
}

function formatState(state: string, ctx: FieldContext): FillValue | null {
  if (!state.trim()) return null;
  const abbreviation = stateAbbreviation(state);
  const name = stateName(abbreviation);
  const short = (ctx.maxLength !== undefined && ctx.maxLength <= 3) || /^[A-Z]{2}$/.test(state.trim());
  return text(short && ctx.tag !== "select" ? abbreviation : name, [abbreviation, state], "state");
}

function location(profile: Profile): string {
  const { city, state } = profile.address;
  if (city && state) return `${city}, ${stateAbbreviation(state)}`;
  return city || state;
}

const CURRENT_JOB_FIELD = /\b(current|currently|present)\b/;

/** Fields like "Current company" or "Current title" (but not "I currently work here" checkboxes). */
function asksForCurrentJob(ctx: FieldContext): boolean {
  if (ctx.inputType === "checkbox") return false;
  return CURRENT_JOB_FIELD.test(normalize(ctx.label || ctx.ariaLabel || ctx.nearbyText || ctx.placeholder));
}

function formatMiddleName(middleName: string, ctx: FieldContext): FillValue | null {
  const name = middleName.trim();
  if (!name) return null;
  const wantsInitial =
    /\binitial\b/.test(normalize([ctx.label, ctx.ariaLabel, ctx.placeholder, ctx.name, ctx.id].join(" "))) ||
    ctx.maxLength === 1;
  return text(wantsInitial ? name.charAt(0).toUpperCase() : name);
}

/** The profile value for `key`, formatted for this field. Null when the profile has nothing to fill. */
export function valueFor(key: FieldKey, profile: Profile, entry: number, ctx: FieldContext): FillValue | null {
  const education = profile.education[entry];
  // "Current company" means the job marked current, not simply the latest one.
  const experience =
    (key === "company" || key === "job_title" || key === "job_location") && asksForCurrentJob(ctx)
      ? profile.experience.find((job) => job.current)
      : profile.experience[entry];

  switch (key) {
    case "first_name":
      return text(profile.firstName);
    case "middle_name":
      return formatMiddleName(profile.middleName, ctx);
    case "last_name":
      return text(profile.lastName);
    case "full_name":
      return text([profile.firstName, profile.lastName].filter(Boolean).join(" "));
    case "preferred_name":
      return text(profile.preferredName || profile.firstName);
    case "email":
      return text(profile.email);
    case "phone":
      return formatPhone(profile.phone, ctx);
    case "address_line1":
      return text(profile.address.line1);
    case "address_line2":
      return text(profile.address.line2);
    case "city":
      return text(profile.address.city);
    case "state":
      return formatState(profile.address.state, ctx);
    case "postal_code":
      return text(profile.address.postalCode);
    case "country":
      return text(profile.address.country, [], "country");
    case "location":
      return text(location(profile), [profile.address.city]);
    case "linkedin":
      return text(profile.links.linkedin);
    case "github":
      return text(profile.links.github);
    case "portfolio":
      return text(profile.links.portfolio);
    case "school":
      return education ? text(education.school) : null;
    case "degree":
      return education ? text(education.degree, [], "degree") : null;
    case "major":
      return education ? text(education.major) : null;
    case "gpa":
      return education ? text(education.gpa) : null;
    case "edu_start":
      return education ? formatDate(education.start, ctx) : null;
    case "edu_end":
      return education ? formatDate(education.end, ctx) : null;
    case "company":
      return experience ? text(experience.company) : null;
    case "job_title":
      return experience ? text(experience.title) : null;
    case "job_location":
      return experience ? text(experience.location) : null;
    case "job_start":
      return experience ? formatDate(experience.start, ctx) : null;
    case "job_end":
      return experience && !experience.current ? formatDate(experience.end, ctx) : null;
    case "job_current":
      return experience ? { kind: "checked", checked: experience.current } : null;
    case "job_description":
      return experience ? text(experience.description) : null;
  }
}
