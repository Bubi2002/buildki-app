export type ReportMarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][]; keyValue: boolean }
  | { type: "blockquote"; text: string }
  | { type: "divider" };

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|");
}

function parseTableCells(line: string): string[] {
  return line.trim().split("|").slice(1, -1).map((cell) => stripInlineMarkdown(cell));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell) || cell === "");
}

export function parseReportMarkdown(markdown: string): ReportMarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReportMarkdownBlock[] = [];
  let index = 0;
  // Remember the last real table's headers so a header-less continuation
  // fragment (rows that appear after an interrupting image/blank line) can reuse
  // them instead of eating its own first row as a bogus header.
  let lastTableHeaders: string[] | null = null;

  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isTableLine(trimmed)) {
      const tableLines: string[] = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const parsedRows = tableLines.map(parseTableCells);
      if (parsedRows.length > 0) {
        const separatorIndex = parsedRows.findIndex((row, rowIndex) => rowIndex > 0 && isSeparatorRow(row));
        if (separatorIndex !== -1) {
          // A real markdown table: first row is the header, followed by a separator.
          const firstRow = parsedRows[0];
          const headersAreEmpty = firstRow.every((cell) => cell === "");
          const headers = headersAreEmpty
            ? ["Feld", "Angabe"]
            : firstRow.map((cell, cellIndex) => cell || `Spalte ${cellIndex + 1}`);
          lastTableHeaders = headers;
          const rows = parsedRows.filter((row, rowIndex) => rowIndex !== 0 && rowIndex !== separatorIndex && !isSeparatorRow(row));
          blocks.push({ type: "table", headers, rows, keyValue: headersAreEmpty || (headers.length === 2 && headers[0].toLocaleLowerCase("de-DE") === "feld") });
        } else {
          // Header-less fragment (rows continuing after an interrupting image/line):
          // every pipe row is data — do NOT drop the first one. Reuse the previous
          // table's headers so it reads as a continuation.
          const rows = parsedRows.filter((row) => !isSeparatorRow(row));
          if (rows.length > 0) {
            const colCount = Math.max(...rows.map((row) => row.length), lastTableHeaders?.length ?? 0, 2);
            const headers = lastTableHeaders && lastTableHeaders.length === colCount
              ? lastTableHeaders
              : Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`);
            blocks.push({ type: "table", headers, rows, keyValue: false });
          }
        }
      }
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length as 1 | 2 | 3, text: stripInlineMarkdown(headingMatch[2]) });
      index += 1;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("> ")) {
        quoteLines.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push({ type: "blockquote", text: stripInlineMarkdown(quoteLines.join(" ")) });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      const itemPattern = ordered ? /^\d+\.\s+(.+)$/ : /^[-*]\s+(.+)$/;
      while (index < lines.length) {
        const itemMatch = lines[index].trim().match(itemPattern);
        if (!itemMatch) break;
        items.push(stripInlineMarkdown(itemMatch[1]));
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (!candidate || isTableLine(candidate) || candidate === "---" || candidate === "***" || /^(#{1,3})\s+/.test(candidate) || candidate.startsWith("> ") || /^[-*]\s+/.test(candidate) || /^\d+\.\s+/.test(candidate)) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
    } else {
      index += 1;
    }
  }

  return blocks;
}
