import type { EducationEntry, ExperienceEntry, Profile, Settings } from "../types";

export function emptyEducation(): EducationEntry {
  return { school: "", degree: "", major: "", gpa: "", start: "", end: "" };
}

export function emptyExperience(): ExperienceEntry {
  return {
    company: "",
    title: "",
    location: "",
    start: "",
    end: "",
    current: false,
    description: "",
  };
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: "http://127.0.0.1:8000",
  apiKey: "",
  model: "",
  // In testing, 0.7 kept wrong fills near zero while losing few correct ones.
  threshold: 0.7,
  overwrite: false,
  useLaya: true,
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Normalize a date to "YYYY-MM-DD", or "YYYY-MM" when no day is given.
 * Accepts "2024-05-17", "05/17/2024", "2024-5", "05/2024" and "May 2024"; anything else becomes "".
 */
export function normalizeDate(value: unknown): string {
  const text = str(value);
  if (!text) return "";
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (match) return formatDateParts(match[1], match[2], match[3]);
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return formatDateParts(match[3], match[1], match[2]);
  match = /^(\d{4})[-/.](\d{1,2})$/.exec(text);
  if (match) return formatDateParts(match[1], match[2]);
  match = /^(\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return formatDateParts(match[2], match[1]);
  match = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(text);
  if (match) {
    const month = MONTH_NAMES.findIndex((name) => name.startsWith(match![1].toLowerCase().slice(0, 3))) + 1;
    if (month > 0) return formatDateParts(match[2], String(month));
  }
  if (/^\d{4}$/.test(text)) return `${text}-01`;
  return "";
}

function formatDateParts(year: string, month: string, day?: string): string {
  const m = Number(month);
  if (m < 1 || m > 12) return "";
  const ym = `${year}-${String(m).padStart(2, "0")}`;
  if (day === undefined) return ym;
  const d = Number(day);
  const daysInMonth = new Date(Number(year), m, 0).getDate();
  if (d < 1 || d > daysInMonth) return "";
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** Fill in missing fields so imported or older stored profiles always have the full shape. */
export function normalizeProfile(raw: unknown): Profile {
  const data = obj(raw);
  const address = obj(data.address);
  const links = obj(data.links);
  const education = Array.isArray(data.education) ? data.education.map(obj) : [];
  const experience = Array.isArray(data.experience) ? data.experience.map(obj) : [];

  return {
    firstName: str(data.firstName),
    middleName: str(data.middleName),
    lastName: str(data.lastName),
    preferredName: str(data.preferredName),
    email: str(data.email),
    phone: str(data.phone),
    address: {
      line1: str(address.line1),
      line2: str(address.line2),
      city: str(address.city),
      state: str(address.state),
      postalCode: str(address.postalCode),
      country: str(address.country),
    },
    links: {
      linkedin: str(links.linkedin),
      github: str(links.github),
      portfolio: str(links.portfolio),
    },
    education: education.map((entry) => ({
      school: str(entry.school),
      degree: str(entry.degree),
      major: str(entry.major),
      gpa: str(entry.gpa),
      start: normalizeDate(entry.start),
      end: normalizeDate(entry.end),
    })),
    experience: experience.map((entry) => ({
      company: str(entry.company),
      title: str(entry.title),
      location: str(entry.location),
      start: normalizeDate(entry.start),
      end: normalizeDate(entry.end),
      current: entry.current === true,
      description: typeof entry.description === "string" ? entry.description : "",
    })),
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const data = obj(raw);
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && value >= 0 && value <= 1 ? value : fallback;
  return {
    serverUrl: str(data.serverUrl).replace(/\/+$/, "") || DEFAULT_SETTINGS.serverUrl,
    apiKey: str(data.apiKey),
    model: typeof data.model === "string" ? data.model.trim() : DEFAULT_SETTINGS.model,
    threshold: num(data.threshold, DEFAULT_SETTINGS.threshold),
    overwrite: data.overwrite === true,
    useLaya: data.useLaya !== false,
  };
}
