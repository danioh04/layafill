/** A date as "YYYY-MM-DD" (the value of `<input type="date">`), "YYYY-MM" when only the month is known, or "". */
export type DateString = string;

export interface EducationEntry {
  school: string;
  degree: string;
  major: string;
  gpa: string;
  start: DateString;
  end: DateString;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  location: string;
  start: DateString;
  end: DateString;
  current: boolean;
  description: string;
}

export interface Profile {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  links: {
    linkedin: string;
    github: string;
    portfolio: string;
  };
  education: EducationEntry[];
  experience: ExperienceEntry[];
}

export interface Settings {
  serverUrl: string;
  apiKey: string;
  /** Laya checkpoint sent as `model`; "" uses the one the server has loaded (asking for another makes it load a second model). */
  model: string;
  /** Minimum probability Laya must give its answer before a field is filled. */
  threshold: number;
  /** Replace values already present in fields (off by default: job sites often prefill from the resume). */
  overwrite: boolean;
  /** Use Laya for fields the rules cannot place. */
  useLaya: boolean;
}

export type Category = "personal" | "address" | "links" | "education" | "experience";

export type FieldKey =
  | "first_name"
  | "middle_name"
  | "middle_name"
  | "last_name"
  | "full_name"
  | "preferred_name"
  | "email"
  | "phone"
  | "address_line1"
  | "address_line2"
  | "city"
  | "state"
  | "postal_code"
  | "country"
  | "location"
  | "linkedin"
  | "github"
  | "portfolio"
  | "school"
  | "degree"
  | "major"
  | "gpa"
  | "edu_start"
  | "edu_end"
  | "company"
  | "job_title"
  | "job_location"
  | "job_start"
  | "job_end"
  | "job_current"
  | "job_description";

export type FieldTag = "input" | "select" | "textarea";

export interface FieldContext {
  fieldId: string;
  tag: FieldTag;
  inputType?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  autocomplete?: string;
  ariaLabel?: string;
  /** Workday-style `data-automation-id`. */
  automationId?: string;
  /** Text of the field's label (label[for], wrapping label, aria-labelledby). */
  label?: string;
  /** Text immediately before the field inside its parent. */
  nearbyText?: string;
  /** Nearest preceding heading or fieldset legend. */
  section?: string;
  /** Ids, automation ids and group labels of ancestors, innermost first. */
  groupHint?: string;
  /** Option texts of a `<select>` (placeholders removed, capped). */
  options?: string[];
  maxLength?: number;
}

export type DecisionSource = "rule" | "laya";

export interface Decision {
  fieldId: string;
  key: FieldKey | null;
  source: DecisionSource | null;
  /** 1 for rules; Laya's probability for its answer otherwise. */
  confidence: number;
  /** Rule name, or why the field was left alone. */
  reason: string;
}

export interface LayaDecisionRequest {
  fields: FieldContext[];
}

export interface FillStats {
  filled: number;
  review: number;
  total: number;
  layaOffline: boolean;
}

export interface FieldDebug {
  context: FieldContext;
  decision: Decision;
  entry: number | null;
  filled: boolean;
}

export type Message =
  | { type: "LAYA_CLASSIFY"; payload: LayaDecisionRequest }
  | { type: "LAYA_MATCH_OPTION"; payload: { value: string; label: string; options: string[] } }
  | { type: "FILL_ACTIVE_TAB"; debug?: boolean };

export type LayaClassifyResponse =
  | { ok: true; decisions: Decision[] }
  | { ok: false; error: string; offline: boolean };

export type LayaMatchOptionResponse =
  | { ok: true; index: number | null; confidence: number }
  | { ok: false; error: string; offline: boolean };

export interface FillTabResponse {
  ok: boolean;
  stats?: FillStats;
  error?: string;
  debug?: FieldDebug[];
}
