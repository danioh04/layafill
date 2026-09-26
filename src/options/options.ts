import { checkHealth } from "../classify/laya-client";
import { emptyEducation, emptyExperience, normalizeProfile, normalizeSettings } from "../profile/profile";
import { deleteResume, resumeName, saveResume } from "../resume";
import { getProfile, getSettings, saveProfile, saveSettings } from "../storage";
import type { EducationEntry, ExperienceEntry, Profile, Settings } from "../types";

type EntryKind = "education" | "experience";

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;

function setStatus(element: HTMLElement, text: string, kind: "ok" | "warn" | "error"): void {
  element.textContent = text;
  element.dataset.kind = kind;
}

// ---- profile fields ----

function getPath(profile: Profile, path: string): string {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], profile) as string;
}

function setPath(profile: Profile, path: string, value: string): void {
  const keys = path.split(".");
  const last = keys.pop()!;
  const target = keys.reduce<Record<string, unknown>>(
    (object, key) => object[key] as Record<string, unknown>,
    profile as unknown as Record<string, unknown>,
  );
  target[last] = value;
}

/** Month-only dates (older profiles) would not show in a date input and be lost on save. */
function dateInputValue(input: Element, value: string): string {
  return input instanceof HTMLInputElement && input.type === "date" && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
}

function renderEntries(kind: EntryKind, entries: (EducationEntry | ExperienceEntry)[]): void {
  const container = $<HTMLDivElement>(`#${kind}`);
  const template = $<HTMLTemplateElement>(`#${kind}-template`);
  container.replaceChildren();
  entries.forEach((entry, index) => {
    const node = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    node.querySelector(".entry-title")!.textContent = `${kind === "education" ? "School" : "Job"} ${index + 1}`;
    for (const input of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-entry]")) {
      const value = (entry as unknown as Record<string, unknown>)[input.dataset.entry!];
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = value === true;
      } else {
        input.value = dateInputValue(input, typeof value === "string" ? value : "");
      }
    }
    node.querySelector('[data-action="up"]')!.addEventListener("click", () => moveEntry(kind, index, -1));
    node.querySelector('[data-action="down"]')!.addEventListener("click", () => moveEntry(kind, index, 1));
    node.querySelector('[data-action="remove"]')!.addEventListener("click", () => removeEntry(kind, index));
    container.append(node);
  });
}

function readEntries(kind: EntryKind): Record<string, string | boolean>[] {
  return Array.from($<HTMLDivElement>(`#${kind}`).querySelectorAll(".entry")).map((node) => {
    const entry: Record<string, string | boolean> = {};
    for (const input of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-entry]")) {
      entry[input.dataset.entry!] =
        input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
    }
    return entry;
  });
}

function readProfile(): Profile {
  const profile = normalizeProfile({});
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]")) {
    setPath(profile, input.dataset.field!, input.value);
  }
  return normalizeProfile({
    ...profile,
    education: readEntries("education"),
    experience: readEntries("experience"),
  });
}

function renderProfile(profile: Profile): void {
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]")) {
    input.value = dateInputValue(input, getPath(profile, input.dataset.field!) ?? "");
  }
  renderEntries("education", profile.education.length ? profile.education : [emptyEducation()]);
  renderEntries("experience", profile.experience.length ? profile.experience : [emptyExperience()]);
}

function moveEntry(kind: EntryKind, index: number, delta: number): void {
  const profile = readProfile();
  const list = profile[kind] as unknown[];
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  renderEntries(kind, profile[kind]);
}

function removeEntry(kind: EntryKind, index: number): void {
  const profile = readProfile();
  profile[kind].splice(index, 1);
  renderEntries(kind, profile[kind]);
}

function addEntry(kind: EntryKind): void {
  const profile = readProfile();
  if (kind === "education") {
    profile.education.push(emptyEducation());
  } else {
    profile.experience.push(emptyExperience());
  }
  renderEntries(kind, profile[kind]);
}

/** Drop entries left completely blank so they are not matched to form sections. */
function withoutBlankEntries(profile: Profile): Profile {
  const blank = (entry: object) =>
    Object.values(entry).every((value) => value === "" || value === false);
  return {
    ...profile,
    education: profile.education.filter((entry) => !blank(entry)),
    experience: profile.experience.filter((entry) => !blank(entry)),
  };
}

// ---- settings ----

const settingInputs = {
  serverUrl: $<HTMLInputElement>("#serverUrl"),
  apiKey: $<HTMLInputElement>("#apiKey"),
  model: $<HTMLSelectElement>("#model"),
  threshold: $<HTMLInputElement>("#threshold"),
  useLaya: $<HTMLInputElement>("#useLaya"),
  overwrite: $<HTMLInputElement>("#overwrite"),
};

function renderSettings(settings: Settings): void {
  settingInputs.serverUrl.value = settings.serverUrl;
  settingInputs.apiKey.value = settings.apiKey;
  settingInputs.model.value = settings.model;
  settingInputs.threshold.value = String(settings.threshold);
  settingInputs.useLaya.checked = settings.useLaya;
  settingInputs.overwrite.checked = settings.overwrite;
}

function readSettings(): Settings {
  return normalizeSettings({
    serverUrl: settingInputs.serverUrl.value,
    apiKey: settingInputs.apiKey.value,
    model: settingInputs.model.value,
    threshold: Number(settingInputs.threshold.value),
    useLaya: settingInputs.useLaya.checked,
    overwrite: settingInputs.overwrite.checked,
  });
}

// ---- actions ----

async function save(): Promise<void> {
  const status = $<HTMLSpanElement>("#save-status");
  try {
    await saveProfile(withoutBlankEntries(readProfile()));
    await saveSettings(readSettings());
    renderSettings(await getSettings());
    setStatus(status, `Saved ${new Date().toLocaleTimeString()}`, "ok");
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : String(error), "error");
  }
}

async function testConnection(): Promise<void> {
  const status = $<HTMLSpanElement>("#connection-status");
  setStatus(status, "Checking…", "warn");
  const health = await checkHealth(readSettings());
  if (health.ok) {
    setStatus(status, `Connected${health.loaded?.length ? `: ${health.loaded.join(", ")}` : ""} on ${health.device ?? "?"}`, "ok");
  } else {
    setStatus(status, `Not reachable (${health.error}). Start it with server\\start.ps1`, "error");
  }
}

function exportProfile(): void {
  const blob = new Blob([JSON.stringify(withoutBlankEntries(readProfile()), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "layafill-profile.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProfile(file: File): Promise<void> {
  const status = $<HTMLSpanElement>("#save-status");
  try {
    renderProfile(normalizeProfile(JSON.parse(await file.text())));
    setStatus(status, "Imported. Review and click Save.", "warn");
  } catch (error) {
    setStatus(status, `Import failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

$("#add-education").addEventListener("click", () => addEntry("education"));
$("#add-experience").addEventListener("click", () => addEntry("experience"));
$("#save").addEventListener("click", () => void save());
$("#test-connection").addEventListener("click", () => void testConnection());
$("#export").addEventListener("click", exportProfile);
$("#import").addEventListener("click", () => $<HTMLInputElement>("#import-file").click());
$<HTMLInputElement>("#import-file").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void importProfile(file);
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "s") {
    event.preventDefault();
    void save();
  }
});

// ---- resume ----

async function renderResume(): Promise<void> {
  const name = await resumeName();
  $<HTMLSpanElement>("#resume-name").textContent = name ?? "No resume saved";
  $<HTMLButtonElement>("#resume-remove").hidden = !name;
}

$("#resume-choose").addEventListener("click", () => $<HTMLInputElement>("#resume-file").click());
$<HTMLInputElement>("#resume-file").addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  void saveResume(file)
    .then(renderResume)
    .catch((error: unknown) =>
      setStatus($("#save-status"), error instanceof Error ? error.message : String(error), "error"),
    );
});
$("#resume-remove").addEventListener("click", () => void deleteResume().then(renderResume));

void (async () => {
  renderProfile(await getProfile());
  renderSettings(await getSettings());
  await renderResume();
})();
