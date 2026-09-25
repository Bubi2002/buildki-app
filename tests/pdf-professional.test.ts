import { describe, expect, it, vi } from "vitest";

vi.mock("expo-print", () => ({ printToFileAsync: vi.fn() }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));

import { generateProfessionalPdfHtml } from "../lib/pdf-professional";

const baseOptions = {
  title: "Projekt-Export",
  subtitle: "Rosenheimerstrasse",
  datum: "18.08.2026",
  projekt: "Rosenheimerstrasse",
  reportType: "Projektbericht",
  accentColor: "#2563EB",
  companyInfo: { name: "Bubifirma" },
  footerText: "Projekt: Rosenheimerstrasse",
  sections: [
    { title: "Mängel (3)", content: "**Zusammenfassung** der Mängel\n- Punkt eins\n- Punkt zwei" },
    { title: "Räume (2)", content: "", table: { headers: ["Geschoss", "Raum", "Status"], rows: [["EG", "Flur", "In Arbeit"], ["1. OG", "Zimmer 1", "Fertig"]] } },
    { title: "Bautagebuch (1)", content: "**18.08.2026** — Sonnig" },
  ],
};

describe("Projekt-Export PDF (generateProfessionalPdfHtml)", () => {
  const html = generateProfessionalPdfHtml(baseOptions);

  it("uses the premium navy house style with a title band", () => {
    expect(html).toContain('class="band"');
    expect(html).toContain('class="title"');
    expect(html).toContain('class="section-chip"');
  });

  it("builds an auto dashboard from section counts", () => {
    expect(html).toContain('class="summary-band"');
    // Values 3 and 2 rendered as stat numbers, labels without the count suffix.
    expect(html).toMatch(/stat-number[^>]*>3</);
    expect(html).toMatch(/stat-number[^>]*>2</);
  });

  it("strips the (N) count from section headings", () => {
    expect(html).toContain(">Mängel</span>");
    expect(html).not.toContain(">Mängel (3)</span>");
  });

  it("renders markdown instead of leaking it into the final PDF", () => {
    expect(html).toContain("<strong>Zusammenfassung</strong>");
    // No raw markdown asterisks anywhere in the output.
    expect(html).not.toContain("**");
  });

  it("guarantees page numbers via CSS counters", () => {
    expect(html).toContain("counter(pages)");
  });

  it("renders tables with muted (non-Excel) headers", () => {
    expect(html).toContain('class="data-table"');
    expect(html).toContain("<th>Status</th>");
  });

  it("escapes HTML in user-provided cell content", () => {
    const withHtml = generateProfessionalPdfHtml({
      ...baseOptions,
      sections: [{ title: "Test (1)", content: "", table: { headers: ["A"], rows: [["<script>x</script>"]] } }],
    });
    expect(withHtml).not.toContain("<script>x</script>");
    expect(withHtml).toContain("&lt;script&gt;");
  });
});
