import { normalizeProfile, normalizeSettings } from "./profile/profile";
import type { Profile, Settings } from "./types";

export async function getProfile(): Promise<Profile> {
  const { profile } = await chrome.storage.local.get("profile");
  return normalizeProfile(profile);
}

export async function saveProfile(profile: Profile): Promise<void> {
  await chrome.storage.local.set({ profile: normalizeProfile(profile) });
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return normalizeSettings(settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: normalizeSettings(settings) });
}
