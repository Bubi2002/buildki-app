import React from "react";
import { Text, View, StyleSheet, ScrollView, type TextStyle, Dimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";

interface MarkdownTextProps {
  text: string;
  style?: TextStyle;
  color?: string;
}

/**
 * Simple Markdown renderer for protocol text.
 * Supports: # H1, ## H2, **bold**, *italic*, markdown tables (| col | col |), and line breaks.
 */
export function MarkdownText({ text, style, color = "#000" }: MarkdownTextProps) {
  const colors = useColors();

  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Empty line = spacer
    if (!trimmed) {
      elements.push(<View key={`spacer-${i}`} style={{ height: 8 }} />);
      i++;
      continue;
    }

    // Detect markdown table (line starts with |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      // Parse table
      if (tableLines.length >= 2) {
        elements.push(
          <View key={`table-${i}`} style={{ marginVertical: 12 }}>
            {renderTable(tableLines, colors, color)}
          </View>
        );
      }
      continue;
    }

    // Check for # chapter heading (large, bold)
    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      const headingText = trimmed.substring(2);
      elements.push(
        <Text key={`h1-${i}`} style={[styles.chapterHeading, { color }]}>
          {headingText}
        </Text>
      );
      i++;
      continue;
    }

    // Check for ## sub-heading
    if (trimmed.startsWith("## ")) {
      const headingText = trimmed.substring(3);
      elements.push(
        <Text key={`h2-${i}`} style={[styles.subHeading, { color }]}>
          {headingText}
        </Text>
      );
      i++;
      continue;
    }

    // Check if line is a heading (starts and ends with ** or is all bold)
    const isHeading = /^\*\*[^*]+\*\*$/.test(trimmed) || /^\*\*\d+\./.test(trimmed);

    elements.push(
      <Text
        key={`line-${i}`}
        style={[
          styles.line,
          style,
          { color },
          isHeading && styles.heading,
        ]}
      >
        {renderInlineMarkdown(trimmed, color, isHeading)}
      </Text>
    );
    i++;
  }

  return <View>{elements}</View>;
}

function renderTable(tableLines: string[], colors: any, textColor: string): React.ReactNode {
  // Parse cells from each line
  const rows = tableLines.map(line => 
    line.split("|").slice(1, -1).map(cell => cell.trim())
  );

  // Check if second row is a separator (---|---|---)
  const hasSeparator = rows.length >= 2 && rows[1].every(cell => /^[-:]+$/.test(cell));
  
  const headerRow = rows[0];
  const dataRows = hasSeparator ? rows.slice(2) : rows.slice(1);
  const colCount = headerRow.length;

  // Calculate column widths based on content
  // Short columns (Nr., Priorität) get less space, long text columns get more
  const screenWidth = Dimensions.get("window").width - 32; // minus padding
  const getColumnWidth = (headerText: string, colIdx: number): number => {
    const lower = headerText.toLowerCase();
    if (lower === "nr." || lower === "nr" || lower === "#") return 30;
    if (lower.includes("priorit")) return 60;
    if (lower.includes("ort") || lower.includes("raum")) return 80;
    if (lower.includes("beschreibung") || lower.includes("mangel")) return 120;
    if (lower.includes("gewerk") || lower.includes("verantwort")) return 100;
    if (lower.includes("frist") || lower.includes("beseitig") || lower.includes("datum")) return 100;
    // Default: distribute evenly
    return Math.max(80, Math.floor(screenWidth / colCount));
  };

  const colWidths = headerRow.map((h, idx) => getColumnWidth(h, idx));
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  // Ensure table is at least as wide as the screen
  const tableWidth = Math.max(totalWidth, screenWidth);
  // Scale columns proportionally if total is less than screen width
  const scale = tableWidth / totalWidth;
  const scaledWidths = colWidths.map(w => Math.floor(w * scale));

  // Defect-style tables render as cards on screen (the PDF keeps the table).
  const findCol = (re: RegExp) => headerRow.findIndex((h) => re.test(h.toLowerCase()));
  const iNr = findCol(/^(nr\.?|#|pos\.?)$/);
  const iOrt = findCol(/ort|raum|etage|geschoss/);
  const iDesc = findCol(/beschreib|mangel|befund|leistung/);
  const iGewerk = findCol(/gewerk|verantwort|firma/);
  const iPrio = findCol(/priorit|schwere|dringlich/);
  const iFrist = findCol(/frist|beseitig|datum|termin/);

  if (iDesc >= 0) {
    const val = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i].trim() : "");
    return (
      <View style={{ gap: 8 }}>
        {dataRows.map((row, rowIdx) => {
          const nr = val(row, iNr), ort = val(row, iOrt), desc = val(row, iDesc);
          const top = [nr, ort].filter(Boolean).join(" · ");
          const fields: [string, string][] = [];
          if (iGewerk >= 0 && val(row, iGewerk)) fields.push([headerRow[iGewerk], val(row, iGewerk)]);
          if (iPrio >= 0 && val(row, iPrio)) fields.push([headerRow[iPrio], val(row, iPrio)]);
          if (iFrist >= 0 && val(row, iFrist)) fields.push([headerRow[iFrist], val(row, iFrist)]);
          return (
            <View key={`card-${rowIdx}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: colors.surface }}>
              {top ? <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 2 }}>{top}</Text> : null}
              {desc ? <Text style={{ fontSize: 15, fontWeight: "700", color: textColor, marginBottom: fields.length ? 6 : 0 }}>{desc}</Text> : null}
              {fields.map(([label, value], i) => (
                <View key={i} style={{ flexDirection: "row", marginTop: 2 }}>
                  <Text style={{ fontSize: 13, color: colors.muted, width: 92 }}>{label}:</Text>
                  <Text style={{ fontSize: 13, color: textColor, flex: 1 }}>{value}</Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ borderWidth: 1, borderColor: colors.border }}>
      <View style={{ width: tableWidth }}>
        {/* Header row */}
        <View style={[tableStyles.row, { backgroundColor: colors.primary + "20" }]}>
          {headerRow.map((cell, colIdx) => (
            <View key={`header-${colIdx}`} style={[tableStyles.cell, { borderColor: colors.border, width: scaledWidths[colIdx] }]}>
              <Text style={[tableStyles.headerText, { color: textColor }]}>
                {cell}
              </Text>
            </View>
          ))}
        </View>
        {/* Data rows */}
        {dataRows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={[tableStyles.row, { backgroundColor: rowIdx % 2 === 0 ? "transparent" : colors.surface }]}>
            {row.map((cell, colIdx) => (
              <View key={`cell-${rowIdx}-${colIdx}`} style={[tableStyles.cell, { borderColor: colors.border, width: scaledWidths[colIdx] || scaledWidths[0] }]}>
                <Text style={[tableStyles.cellText, { color: textColor }]}>
                  {cell}
                </Text>
              </View>
            ))}
            {/* Fill missing cells if row has fewer columns than header */}
            {row.length < headerRow.length && Array.from({ length: headerRow.length - row.length }).map((_, colIdx) => (
              <View key={`empty-${rowIdx}-${colIdx}`} style={[tableStyles.cell, { borderColor: colors.border, width: scaledWidths[row.length + colIdx] || 80 }]}>
                <Text style={[tableStyles.cellText, { color: textColor }]}>-</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function renderInlineMarkdown(text: string, color: string, isHeading: boolean): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Match **bold** and *italic* patterns
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      elements.push(
        <Text key={key++} style={{ color }}>
          {text.slice(lastIndex, match.index)}
        </Text>
      );
    }

    if (match[2]) {
      // **bold**
      elements.push(
        <Text key={key++} style={{ fontWeight: "700", color }}>
          {match[2]}
        </Text>
      );
    } else if (match[3]) {
      // *italic*
      elements.push(
        <Text key={key++} style={{ fontStyle: "italic", color }}>
          {match[3]}
        </Text>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    elements.push(
      <Text key={key++} style={{ color }}>
        {text.slice(lastIndex)}
      </Text>
    );
  }

  return elements;
}

const tableStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  cell: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    justifyContent: "center",
  },
  headerText: {
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 14,
  },
  cellText: {
    fontSize: 11,
    lineHeight: 15,
  },
});

const styles = StyleSheet.create({
  line: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 2,
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 26,
    marginTop: 12,
    marginBottom: 4,
  },
  chapterHeading: {
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subHeading: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 14,
    marginBottom: 6,
  },
});
