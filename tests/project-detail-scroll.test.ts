import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/project-detail.tsx"), "utf8");

describe("project detail mobile scrolling", () => {
  it("uses one primary FlatList for tools and protocols", () => {
    const projectList = source.indexOf("<FlatList\n          data={protocols}");
    const listHeader = source.indexOf("ListHeaderComponent={(\n            <>", projectList);
    const tools = source.indexOf("styles.toolsSection", listHeader);
    const protocolRenderer = source.indexOf("renderItem={({ item }) => (", tools);

    expect(projectList).toBeGreaterThanOrEqual(0);
    expect(listHeader).toBeGreaterThan(projectList);
    expect(tools).toBeGreaterThan(listHeader);
    expect(protocolRenderer).toBeGreaterThan(tools);
  });

  it("keeps sufficient bottom space for the iPhone home indicator and tab bar", () => {
    expect(source).toContain("contentContainerStyle={styles.projectScrollContent}");
    expect(source).toContain("projectScroll: { flex: 1 }");
    expect(source).toContain("projectScrollContent: { paddingBottom: 120 }");
    expect(source).toContain("showsVerticalScrollIndicator");
  });

  it("keeps protocol rows aligned after moving them into the page list", () => {
    expect(source).toContain('marginHorizontal: 16, marginBottom: 8');
    expect(source).toContain('emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 16');
  });
});
