"use strict";

const UNICODE_ESCAPE_PATTERN = /\\+u\{([0-9a-fA-F]{1,6})\}|\\+u([0-9a-fA-F]{4})/g;

function decodeUnicodeEscapes(value) {
  let decoded = value;

  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(UNICODE_ESCAPE_PATTERN, (match, braced, fixed) => {
      const codePoint = Number.parseInt(braced || fixed || "", 16);
      if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return match;
      return String.fromCodePoint(codePoint);
    });

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

module.exports = function decodeJsxUnicodeEscapesPlugin() {
  return {
    name: "decode-jsx-unicode-escapes",
    visitor: {
      JSXText(path) {
        const decoded = decodeUnicodeEscapes(path.node.value);
        if (decoded !== path.node.value) path.node.value = decoded;
      },
      JSXAttribute(path) {
        const value = path.node.value;
        if (!value || value.type !== "StringLiteral") return;

        const decoded = decodeUnicodeEscapes(value.value);
        if (decoded !== value.value) value.value = decoded;
      },
    },
  };
};

module.exports.decodeUnicodeEscapes = decodeUnicodeEscapes;
