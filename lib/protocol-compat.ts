export type LegacyProtocolTextFields = {
  protocol?: unknown;
  content?: unknown;
  transcription?: unknown;
  title?: unknown;
  protocolNumber?: unknown;
};

const EMPTY_PROTOCOL_TEXT = "Noch kein Protokollinhalt vorhanden.";

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getProtocolText(record: LegacyProtocolTextFields): string {
  const protocol = asTrimmedString(record.protocol);
  if (protocol) return protocol;

  const content = asTrimmedString(record.content);
  if (content) return content;

  const transcription = asTrimmedString(record.transcription);
  if (transcription) return transcription;

  return EMPTY_PROTOCOL_TEXT;
}

/** True when the record has any usable protocol text (protocol/content/transcription). */
export function hasProtocolText(record: LegacyProtocolTextFields): boolean {
  return !!(asTrimmedString(record.protocol) || asTrimmedString(record.content) || asTrimmedString(record.transcription));
}

export function getProtocolPreview(
  record: LegacyProtocolTextFields,
  maxLength: number,
): string {
  return getProtocolText(record).slice(0, Math.max(0, maxLength));
}

export function getProtocolSearchText(record: LegacyProtocolTextFields): string {
  return [
    asTrimmedString(record.title),
    asTrimmedString(record.protocolNumber),
    asTrimmedString(record.protocol),
    asTrimmedString(record.transcription),
    getProtocolText(record),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("de");
}

export function ensureProtocolTextFields<T extends LegacyProtocolTextFields>(
  record: T,
): T & { protocol: string; transcription: string } {
  const transcription = asTrimmedString(record.transcription);
  return {
    ...record,
    transcription,
    protocol: getProtocolText(record),
  };
}
