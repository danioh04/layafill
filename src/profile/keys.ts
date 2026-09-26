import type { Category, FieldKey } from "../types";

interface KeyInfo {
  category: Category;
  /** Option text shown to Laya. Keep short: every option shares a ~192-token budget. */
  description: string;
}

export const KEYS: Record<FieldKey, KeyInfo> = {
  first_name: { category: "personal", description: "first name or given name" },
  middle_name: { category: "personal", description: "middle name or middle initial" },
  last_name: { category: "personal", description: "last name, family name or surname" },
  full_name: { category: "personal", description: "full name, first and last together" },
  preferred_name: { category: "personal", description: "preferred name or nickname" },
  email: { category: "personal", description: "email address" },
  phone: { category: "personal", description: "phone or mobile number" },

  address_line1: { category: "address", description: "street address" },
  address_line2: { category: "address", description: "apartment, suite or unit" },
  city: { category: "address", description: "city" },
  state: { category: "address", description: "state or province" },
  postal_code: { category: "address", description: "zip or postal code" },
  country: { category: "address", description: "country" },
  location: { category: "address", description: "current location as city and state" },

  linkedin: { category: "links", description: "LinkedIn profile URL" },
  github: { category: "links", description: "GitHub profile URL" },
  portfolio: { category: "links", description: "personal website or portfolio URL" },

  school: { category: "education", description: "school, college or university name" },
  degree: { category: "education", description: "degree, such as Bachelor of Science" },
  major: { category: "education", description: "major, field of study or discipline" },
  gpa: { category: "education", description: "GPA or grade average" },
  edu_start: { category: "education", description: "date studies started" },
  edu_end: { category: "education", description: "graduation or end date" },

  company: { category: "experience", description: "employer or company name" },
  job_title: { category: "experience", description: "job title or position" },
  job_location: { category: "experience", description: "job location" },
  job_start: { category: "experience", description: "job start date" },
  job_end: { category: "experience", description: "job end date" },
  job_current: { category: "experience", description: "whether this is the current job" },
  job_description: { category: "experience", description: "job description or responsibilities" },
};

/**
 * Keys Laya chooses between, in one choice question with "other". Kept to ~16
 * options: past ~20 Laya trims every option to fit its budget. The rest (dates,
 * address parts, descriptions) are left to the rules, which handle them well.
 * In testing, one flat question beat a category-then-key pair.
 */
export const LAYA_KEYS: FieldKey[] = [
  "first_name",
  "last_name",
  "full_name",
  "preferred_name",
  "email",
  "phone",
  "location",
  "linkedin",
  "github",
  "portfolio",
  "school",
  "degree",
  "major",
  "company",
  "job_title",
];

export const OTHER_DESCRIPTION = "something else, such as an essay question, salary, visa or demographics";

export function isEntryCategory(category: Category): category is "education" | "experience" {
  return category === "education" || category === "experience";
}
