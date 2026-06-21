import React from "react";
import { Text, View, StyleSheet, type TextStyle } from "react-native";

interface MarkdownTextProps {
  text: string;
  style?: TextStyle;
  color?: string;
}

/**
 * Simple Markdown renderer for protocol text.
 * Supports: # H1, ## H2, **bold**, *italic*, headings (lines starting with **text**), and line breaks.
 */
export function MarkdownText({ text, style, color = "#000" }: MarkdownTextProps) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <View>
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <View key={lineIdx} style={{ height: 8 }} />;
        }

        // Check for # chapter heading (large, bold)
        if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
          const headingText = trimmed.substring(2);
          return (
            <Text key={lineIdx} style={[styles.chapterHeading, { color }]}>
              {headingText}
            </Text>
          );
        }

        // Check for ## sub-heading
        if (trimmed.startsWith("## ")) {
          const headingText = trimmed.substring(3);
          return (
            <Text key={lineIdx} style={[styles.subHeading, { color }]}>
              {headingText}
            </Text>
          );
        }

        // Check if line is a heading (starts and ends with ** or is all bold)
        const isHeading = /^\*\*[^*]+\*\*$/.test(trimmed) || /^\*\*\d+\./.test(trimmed);

        return (
          <Text
            key={lineIdx}
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
      })}
    </View>
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
