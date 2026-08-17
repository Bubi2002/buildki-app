/**
 * Convert a Markdown report (as produced by the LLM Bautagebuch / report tools)
 * into clean, styled HTML for PDF export: real headings, bold text, lists and
 * dividers instead of raw "#"/"**" markers.
 */

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline formatting: **bold** and *italic* (bold first so ** isn't eaten by *).
function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** Returns the report body HTML (no <html>/<style> wrapper). */
export function markdownReportToHtml(markdown: string): string {
  const lines = (markdown || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeList();
      html += '<hr class="rule"/>';
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)$/))) { closeList(); html += `<h3>${inline(m[1])}</h3>`; continue; }
    if ((m = line.match(/^##\s+(.*)$/))) { closeList(); html += `<h2>${inline(m[1])}</h2>`; continue; }
    if ((m = line.match(/^#\s+(.*)$/))) { closeList(); html += `<h1>${inline(m[1])}</h1>`; continue; }
    if ((m = line.match(/^[-*•]\s+(.*)$/))) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(m[1])}</li>`;
      continue;
    }
    if (trimmed === "") { closeList(); continue; }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

/** CSS for the report body. Pass an accent colour (defaults to blue). */
export function markdownReportStyles(accent = "#2563EB"): string {
  return `
    .md-report h1 { font-size: 22px; color: ${accent}; margin: 0 0 8px; font-weight: 800; }
    .md-report h2 {
      font-size: 15px; color: #111827; font-weight: 800;
      background: ${accent}14; border-left: 4px solid ${accent};
      padding: 8px 12px; margin: 22px 0 12px; border-radius: 0 4px 4px 0;
    }
    .md-report h3 { font-size: 13px; color: ${accent}; margin: 16px 0 4px; font-weight: 700; }
    .md-report p { font-size: 12.5px; line-height: 1.6; margin: 6px 0; color: #1F2937; }
    .md-report strong { color: #111827; font-weight: 700; }
    .md-report em { color: #374151; font-style: italic; }
    .md-report ul { margin: 6px 0; padding-left: 20px; }
    .md-report li { font-size: 12.5px; line-height: 1.6; margin: 3px 0; color: #1F2937; }
    .md-report hr.rule { border: none; border-top: 1px solid #E5E7EB; margin: 14px 0; }
  `;
}
