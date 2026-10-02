import { Platform } from "react-native";

export type PhoneContactEmail = { name: string; email: string };

export type LoadContactsResult =
  | { ok: true; contacts: PhoneContactEmail[] }
  | { ok: false; reason: "web" | "denied" | "empty" | "error"; message?: string };

export type PhoneContact = { name: string; email?: string; phone?: string };
export type LoadAllContactsResult =
  | { ok: true; contacts: PhoneContact[] }
  | { ok: false; reason: "web" | "denied" | "empty" | "error"; message?: string };

/**
 * Load ALL address-book contacts that have a name (not just those with an
 * email), with their first email/phone for display. Used for the "Zuständig"
 * autocomplete, where a name (e.g. a trade/handyman without an email) is enough.
 */
export async function loadPhoneContacts(): Promise<LoadAllContactsResult> {
  if (Platform.OS === "web") return { ok: false, reason: "web" };
  try {
    const Contacts = await import("expo-contacts/legacy");
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "denied" };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      sort: Contacts.SortTypes?.FirstName || undefined,
    });

    const seen = new Set<string>();
    const out: PhoneContact[] = [];
    for (const c of data || []) {
      const name = (c.name || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        email: (c.emails?.[0]?.email || "").trim() || undefined,
        phone: (c.phoneNumbers?.[0]?.number || "").trim() || undefined,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "de"));
    if (out.length === 0) return { ok: false, reason: "empty" };
    return { ok: true, contacts: out };
  } catch (e: any) {
    return { ok: false, reason: "error", message: e?.message };
  }
}

/**
 * Load the phone's address-book contacts that have an email address, flattened
 * to one entry per email (a contact with two emails yields two entries) and
 * de-duplicated by email. Used to pick mail recipients without typing them.
 *
 * expo-contacts is imported dynamically so the web build never pulls it in.
 */
export async function loadPhoneContactEmails(): Promise<LoadContactsResult> {
  if (Platform.OS === "web") return { ok: false, reason: "web" };
  try {
    const Contacts = await import("expo-contacts/legacy");
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "denied" };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Emails, Contacts.Fields.Name],
      sort: Contacts.SortTypes?.FirstName || undefined,
    });

    const out: PhoneContactEmail[] = [];
    for (const c of data || []) {
      const name = (c.name || "").trim();
      for (const e of c.emails || []) {
        const email = (e.email || "").trim();
        if (email) out.push({ name: name || email, email });
      }
    }

    const seen = new Set<string>();
    const deduped = out.filter((x) => {
      const key = x.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    deduped.sort((a, b) => a.name.localeCompare(b.name, "de"));

    if (deduped.length === 0) return { ok: false, reason: "empty" };
    return { ok: true, contacts: deduped };
  } catch (e: any) {
    return { ok: false, reason: "error", message: e?.message };
  }
}
