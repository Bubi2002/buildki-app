import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const outputDir = process.argv[2] || path.join(path.dirname(root), "protoki-legal-compliance");
const sourceRoots = ["app", "components", "hooks", "lib", "server", "shared"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const exactOpenMarker = "OFFEN – VOR VERÖFFENTLICHUNG ZU ERGÄNZEN";

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") return [];
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : extensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

function location(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: path.relative(root, sourceFile.fileName),
    line: position.line + 1,
    column: position.character + 1,
  };
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function hasRenderedLiteralUnicodeEscape(raw, kind) {
  const tokenPattern = /\\+(?:u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2})/gu;
  for (const match of raw.matchAll(tokenPattern)) {
    const slashCount = match[0].match(/^\\+/u)?.[0].length ?? 0;
    if (kind === "jsx" || slashCount % 2 === 0) return true;
  }
  return false;
}

function collectTextNodes(fileName) {
  const source = fs.readFileSync(fileName, "utf8");
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const records = [];

  function add(node, value, kind) {
    const text = normalize(value);
    if (!text) return;
    const raw = node.getText(sourceFile);
    records.push({
      ...location(sourceFile, node),
      kind,
      text,
      literalUnicodeEscape: hasRenderedLiteralUnicodeEscape(raw, kind),
    });
  }

  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, node.text, "string");
    } else if (ts.isTemplateExpression(node)) {
      const templateParts = [node.head.text];
      for (const span of node.templateSpans) {
        templateParts.push(`\${${span.expression.getText(sourceFile)}}`, span.literal.text);
      }
      add(node, templateParts.join(" "), "template");
    } else if (ts.isJsxText(node)) {
      add(node, node.getText(sourceFile), "jsx");
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return records;
}

const blockingRules = [
  {
    id: "COPY-PRICE-CLAIM",
    description: "Konkrete Preisangabe in Quelltext-String",
    pattern: /(?:\b\d+[,.]\d{2}\s*(?:€|EUR)\b)|(?:\b(?:12[,.]99|140[,.]00|10[,.]00|100[,.]00)\b)/iu,
  },
  {
    id: "COPY-TRIAL-PROMISE",
    description: "Konkretes 14-Tage-/Trial-Versprechen",
    pattern: /14\s*[-–]?\s*(?:Tage|täg|taeg)|trial_period_days/iu,
  },
  {
    id: "COPY-OLD-BRAND",
    description: "Alte Produktbezeichnung ProtoKI",
    pattern: /\bProtoKI\b/u,
  },
  {
    id: "COPY-LITERAL-UNICODE-ESCAPE",
    description: "Wörtlich sichtbare Unicode-Escape-Sequenz statt gerendertem Zeichen",
    test: (record) => record.literalUnicodeEscape,
  },
  {
    id: "COPY-VERIFICATION-BYPASS",
    description: "Sichtbarer MVP-/Verifikationsbypass",
    pattern: /Später bestätigen|Skip\s*\(MVP\)/iu,
  },
  {
    id: "COPY-FALSE-PRIVACY-CLAIM",
    description: "Technisch widerlegte pauschale Datenschutzbehauptung",
    pattern: /alle Daten.{0,40}lokal|Deinstallation.{0,80}vollständig gelöscht|Weitergabe.{0,30}an Dritte.{0,20}(?:erfolgt nicht|keine)|Server.{0,80}automatisch gelöscht/iu,
  },
  {
    id: "COPY-UNFINISHED-FUNCTION",
    description: "Sichtbarer Hinweis auf eine nicht implementierte oder noch nicht verfügbare Funktion",
    pattern: /noch nicht implementiert|nicht implementiert|NOCH NICHT VERFÜGBAR|bald verfügbar|coming soon/iu,
  },
  {
    id: "COPY-EXAMPLE-PROJECT",
    description: "Automatisch eingesetztes Beispielprojekt statt neutraler Feldbezeichnung",
    pattern: /\bBeispielprojekt\b|\bExample Project\b|\bProjet exemple\b/iu,
  },
  {
    id: "COPY-MVP-STRING",
    description: "MVP-Entwicklungskennzeichnung in statischem sichtbarem Text",
    pattern: /\bMVP\b/u,
  },
];

function isNegativeDemoStatement(text) {
  if (!/Demo[- ]?(?:Abo|Abonnement|Kauf|Modus)/iu.test(text)) return true;
  return /(?:kein|keine|keinen|keinem|ohne|deaktiviert|gesperrt).{0,45}Demo[- ]?(?:Abo|Abonnement|Kauf|Modus)/iu.test(text);
}

function hasUnmarkedLegalOpen(text) {
  const hasStandaloneOpen = /(^|[^\p{L}\p{N}_])OFFEN([^\p{L}\p{N}_]|$)/iu.test(text);
  const hasDynamicMarker = /\$\{(?:OPEN|LEGAL_DRAFT_MARKER)\}/u.test(text);
  if (!hasStandaloneOpen || text.includes(exactOpenMarker) || hasDynamicMarker) return false;
  const legalTerm = "Provider|Veröffentlich|Tarif|Zahl|Vertrag|Lösch|Betreiber|Anbieter|Rechts|Datenschutz|B2B|B2C";
  const openNearLegalContext = new RegExp(
    `(?:^|[^\\p{L}\\p{N}_])OFFEN([^\\p{L}\\p{N}_]|$).{0,120}(?:${legalTerm})|(?:${legalTerm}).{0,120}(?:^|[^\\p{L}\\p{N}_])OFFEN([^\\p{L}\\p{N}_]|$)`,
    "iu",
  );
  return openNearLegalContext.test(text);
}

const files = sourceRoots.flatMap((sourceRoot) => walk(path.join(root, sourceRoot)));
if (fs.existsSync(path.join(root, "app.config.js"))) files.push(path.join(root, "app.config.js"));
const records = files.flatMap(collectTextNodes);
const blockers = [];
const review = [];

for (const record of records) {
  for (const rule of blockingRules) {
    const matches = rule.pattern ? rule.pattern.test(record.text) : rule.test?.(record) === true;
    if (matches) blockers.push({ ...record, ruleId: rule.id, description: rule.description });
  }
  if (!isNegativeDemoStatement(record.text)) {
    blockers.push({ ...record, ruleId: "COPY-DEMO-FUNCTION", description: "Demo-Kauf-/Abo-/Modus-Text ohne eindeutige Negation" });
  }
  if (hasUnmarkedLegalOpen(record.text)) {
    blockers.push({ ...record, ruleId: "COPY-UNMARKED-LEGAL-OPEN", description: "Rechtlich offener Punkt ohne exakten Pflichtmarker" });
  }
  if (/\b(?:TODO|FIXME)\b/u.test(record.text)) {
    review.push({ ...record, ruleId: "COPY-TODO-REVIEW", description: "TODO/FIXME in einem String; Kontext manuell prüfen" });
  }
}

const uniqueBy = (items, keyFn) => [...new Map(items.map((item) => [keyFn(item), item])).values()];
const uniqueBlockers = uniqueBy(blockers, (item) => `${item.ruleId}:${item.file}:${item.line}:${item.text}`);
const uniqueReview = uniqueBy(review, (item) => `${item.ruleId}:${item.file}:${item.line}:${item.text}`);

const urlRecords = [];
const urlPattern = /https?:\/\/[^\s"'<>`]+/giu;
for (const record of records) {
  for (const match of record.text.matchAll(urlPattern)) {
    const url = match[0].replace(/[),.;]+$/u, "");
    let category = "external-service";
    if (/localhost|127\.0\.0\.1|dummy/iu.test(url)) category = "local-development";
    else if (/example\.com/iu.test(url)) category = "example-placeholder";
    else if (/protokollapp-c7amcxpp\.manus\.space/iu.test(url)) category = "current-deployment-default";
    urlRecords.push({ ...record, url, category });
  }
}
const urls = uniqueBy(urlRecords, (item) => `${item.file}:${item.line}:${item.url}`);

const sourceText = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const invariants = {
  exactOpenMarkerDefined: sourceText.includes(`LEGAL_DRAFT_MARKER = "${exactOpenMarker}"`),
  requiredLegalRoutesPresent: ["/datenschutz", "/impressum", "/nutzungsbedingungen", "/privacy-choices", "/support"].every((route) => sourceText.includes(route)),
  supportEmailPresent: sourceText.includes("info@iserloh.net"),
  staleStandalonePrivacyManifestAbsent: !fs.existsSync(path.join(root, "ios-privacy-manifest.json")),
  buildEffectivePrivacyManifestPresent: fs.readFileSync(path.join(root, "app.config.js"), "utf8").includes("privacyManifests"),
  literalUnicodeEscapeRuleEnabled: blockingRules.some((rule) => rule.id === "COPY-LITERAL-UNICODE-ESCAPE"),
};

for (const [name, passed] of Object.entries(invariants)) {
  if (!passed) {
    uniqueBlockers.push({
      file: "repository",
      line: 1,
      column: 1,
      kind: "invariant",
      text: name,
      ruleId: "COPY-INVARIANT",
      description: `Compliance-Invariante fehlgeschlagen: ${name}`,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  root,
  scannedFiles: files.length,
  scannedTextNodes: records.length,
  blockerCount: uniqueBlockers.length,
  reviewCount: uniqueReview.length,
  urlCount: urls.length,
  invariants,
  blockers: uniqueBlockers,
  review: uniqueReview,
  urls,
  notes: [
    "Der Scanner prüft statische String-/Template-/JSX-Texte; dynamisch geladene Remote-Inhalte und native Buildartefakte sind separat zu prüfen.",
    "Normale Eingabeplatzhalter und fachliche Begriffe wie 'offene Mängel' sind kein rechtlicher OFFEN-Marker.",
    "Öffentliche URLs werden nur inventarisiert; Erreichbarkeit und Seiteninhalt werden in einem getrennten Live-Link-Nachweis geprüft.",
    "Wörtlich gerenderte Unicode-Escapes wie \\u00E4 oder \\u20AC werden als Blocker erkannt; gültige Escapes innerhalb normaler JavaScript-Stringliterale werden vom Parser korrekt dekodiert.",
  ],
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "visible-copy-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const tableRows = uniqueBlockers.length
  ? uniqueBlockers.map((item) => `| ${item.ruleId} | \`${item.file}:${item.line}\` | ${item.description} | ${item.text.replace(/\|/g, "\\|").slice(0, 180)} |`).join("\n")
  : "| – | – | Keine blockierenden statischen Texttreffer | – |";
const urlRows = urls.length
  ? urls.map((item) => `| ${item.category} | \`${item.file}:${item.line}\` | ${item.url.replace(/\|/g, "\\|")} |`).join("\n")
  : "| – | – | Keine URLs gefunden |";
const invariantRows = Object.entries(invariants)
  .map(([name, passed]) => `| ${name} | ${passed ? "BESTANDEN" : "FEHLER"} |`)
  .join("\n");

const markdown = `# Automatisierter sichtbarer Text- und Link-Audit\n\n**Erzeugt:** ${report.generatedAt}  \n**Dateien:** ${report.scannedFiles}  \n**Statische Textknoten:** ${report.scannedTextNodes}  \n**Blocker im Quelltext:** ${report.blockerCount}  \n**Manuelle Prüftreffer:** ${report.reviewCount}  \n**Inventarisierte URLs:** ${report.urlCount}\n\n> Dieser AST-basierte Audit erkennt statische String-, Template- und JSX-Texte. Remote-Inhalte, Laufzeitdaten und native Buildartefakte benötigen getrennte Prüfungen.\n\n## Compliance-Invarianten\n\n| Invariante | Ergebnis |\n|---|---|\n${invariantRows}\n\n## Blockierende Texttreffer\n\n| Regel | Fundstelle | Beschreibung | Textauszug |\n|---|---|---|---|\n${tableRows}\n\n## URL-Inventar\n\n| Kategorie | Fundstelle | URL |\n|---|---|---|\n${urlRows}\n\n## Bewertung\n\nDer statische Quelltext-Audit ${uniqueBlockers.length === 0 ? "ist bestanden" : "ist nicht bestanden"}. Die öffentliche Erreichbarkeit und inhaltliche Richtigkeit der Rechts-/Supportseiten wird unabhängig davon geprüft und kann weiterhin eine Veröffentlichungssperre darstellen.\n`;
fs.writeFileSync(path.join(outputDir, "visible-copy-scan.md"), markdown, "utf8");

console.log(`Scanned ${report.scannedFiles} files and ${report.scannedTextNodes} text nodes.`);
console.log(`Blockers: ${report.blockerCount}; review items: ${report.reviewCount}; URLs: ${report.urlCount}.`);
console.log(`Reports: ${path.join(outputDir, "visible-copy-scan.json")}, ${path.join(outputDir, "visible-copy-scan.md")}`);
process.exitCode = report.blockerCount === 0 ? 0 : 1;
