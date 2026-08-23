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

/** CSS for the report body — calm navy house style with numbered section
 * blocks and a short accent underline (matches the premium report look). */
export function markdownReportStyles(accent = "#0E7490"): string {
  const NAVY = "#0F2744";
  return `
    .md-report { counter-reset: sec; }
    .md-report h1 { font-size: 20px; color: ${NAVY}; margin: 0 0 8px; font-weight: 800; }
    .md-report h2 {
      counter-increment: sec;
      position: relative;
      display: flex; align-items: center; gap: 10px;
      font-size: 15px; color: ${NAVY}; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.4px;
      margin: 26px 0 14px; padding: 0 0 10px;
      border-bottom: 1px solid #e8ecf1;
    }
    .md-report h2::before {
      content: counter(sec, decimal-leading-zero);
      background: ${NAVY}; color: #fff; font-size: 12px; font-weight: 800;
      width: 28px; height: 28px; border-radius: 6px; flex: none;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .md-report h2::after {
      content: ""; position: absolute; left: 38px; bottom: -1px;
      width: 46px; height: 2px; background: ${accent};
    }
    .md-report h3 { font-size: 13px; color: #334155; margin: 16px 0 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .md-report p { font-size: 12.5px; line-height: 1.6; margin: 6px 0; color: #334155; }
    .md-report strong { color: ${NAVY}; font-weight: 700; }
    .md-report em { color: #475569; font-style: italic; }
    .md-report ul { margin: 6px 0; padding-left: 20px; }
    .md-report li { font-size: 12.5px; line-height: 1.6; margin: 3px 0; color: #334155; }
    .md-report hr.rule { border: none; border-top: 1px solid #eef1f5; margin: 16px 0; }
  `;
}
