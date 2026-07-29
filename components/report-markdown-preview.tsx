import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { parseReportMarkdown } from "@/lib/report-markdown-parser";

function InlineText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*.*?\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={[styles.paragraphText, { color }]}>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <Text key={index} style={styles.boldText}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <Text key={index} style={styles.italicText}>{part.slice(1, -1)}</Text>;
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

export function ReportMarkdownPreview({ markdown }: { markdown: string }) {
  const colors = useColors();
  const blocks = parseReportMarkdown(markdown);

  return (
    <View style={styles.document}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "heading") {
          const headingStyle = block.level === 1 ? styles.heading1 : block.level === 2 ? styles.heading2 : styles.heading3;
          return <Text key={blockIndex} style={[headingStyle, { color: colors.foreground }]}>{block.text}</Text>;
        }
        if (block.type === "divider") {
          return <View key={blockIndex} style={[styles.divider, { backgroundColor: colors.border }]} />;
        }
        if (block.type === "paragraph") {
          return <View key={blockIndex} style={styles.paragraph}><InlineText text={block.text} color={colors.foreground} /></View>;
        }
        if (block.type === "blockquote") {
          return (
            <View key={blockIndex} style={[styles.quote, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}>
              <Text style={[styles.quoteText, { color: colors.muted }]}>{block.text}</Text>
            </View>
          );
        }
        if (block.type === "list") {
          return (
            <View key={blockIndex} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listRow}>
                  <Text style={[styles.listMarker, { color: colors.primary }]}>{block.ordered ? `${itemIndex + 1}.` : "•"}</Text>
                  <Text style={[styles.listText, { color: colors.foreground }]}>{item}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === "table" && block.keyValue) {
          return (
            <View key={blockIndex} style={[styles.keyValueTable, { borderColor: colors.border }]}>
              {block.rows.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.keyValueRow, rowIndex > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <Text style={[styles.keyValueLabel, { color: colors.muted }]}>{row[0] || "Angabe"}</Text>
                  <Text style={[styles.keyValueValue, { color: colors.foreground }]}>{row[1] || "nicht angegeben"}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === "table") {
          return (
            <View key={blockIndex} style={styles.recordTable}>
              {block.rows.map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.recordCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  {block.headers.map((header, cellIndex) => (
                    <View key={cellIndex} style={styles.recordField}>
                      <Text style={[styles.recordLabel, { color: colors.muted }]}>{header}</Text>
                      <Text style={[styles.recordValue, { color: colors.foreground }]}>{row[cellIndex] || "nicht angegeben"}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  document: { paddingBottom: 32 },
  heading1: { fontSize: 25, lineHeight: 32, fontWeight: "900", marginBottom: 20, letterSpacing: -0.5 },
  heading2: { fontSize: 21, lineHeight: 27, fontWeight: "800", marginTop: 24, marginBottom: 12 },
  heading3: { fontSize: 17, lineHeight: 23, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  paragraph: { marginBottom: 10 },
  paragraphText: { fontSize: 15, lineHeight: 23 },
  boldText: { fontWeight: "800" },
  italicText: { fontStyle: "italic" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  quote: { borderLeftWidth: 3, paddingHorizontal: 13, paddingVertical: 11, marginVertical: 8 },
  quoteText: { fontSize: 14, lineHeight: 21, fontStyle: "italic" },
  list: { gap: 8, marginBottom: 12 },
  listRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  listMarker: { width: 22, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  listText: { flex: 1, fontSize: 15, lineHeight: 22 },
  keyValueTable: { borderWidth: 1, marginVertical: 10 },
  keyValueRow: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 12, paddingVertical: 11, gap: 12 },
  keyValueLabel: { width: 104, fontSize: 12, lineHeight: 18, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  keyValueValue: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  recordTable: { gap: 10, marginVertical: 10 },
  recordCard: { borderWidth: 1, padding: 12, gap: 8 },
  recordField: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  recordLabel: { width: 102, fontSize: 11, lineHeight: 17, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  recordValue: { flex: 1, fontSize: 14, lineHeight: 20 },
});
