const UNICODE_ESCAPE_PATTERN = /\\+u\{([0-9a-fA-F]{1,6})\}|\\+u([0-9a-fA-F]{4})/g;

export function decodeUnicodeEscapes(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(
      UNICODE_ESCAPE_PATTERN,
      (_match, braced: string | undefined, fixed: string | undefined) => {
        const codePoint = Number.parseInt(braced || fixed || "", 16);
        if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return _match;
        return String.fromCodePoint(codePoint);
      },
    );
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}
