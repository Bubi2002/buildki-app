/**
 * protoKI – Construction Brain
 * 
 * Zentraler Projektassistent. Arbeitet AUSSCHLIESSLICH auf dem Knowledge Layer.
 * Keine Rohdaten-Analyse. Strukturierte Antworten statt reiner Chat.
 * 
 * Features:
 * - Intent-Erkennung (lokal)
 * - Strukturierte Ergebnisse (Mängel, Aufgaben, Räume, Gewerke)
 * - Vorschläge für Folgefragen
 * - Conversation Memory
 * - Quick Actions für häufige Fragen
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { constructionBrain, type BrainResponse, type BrainResponseDetail } from "@/lib/construction-brain";

// ─── Types ───────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string;
  question: string;
  response: BrainResponse;
  timestamp: string;
};

// ─── Quick Actions ──────────────────────────────────────────────────────────

// label holds a translation KEY (resolved with t() at render). query stays in
// German because it is the input to the local intent-detection logic.
const QUICK_ACTIONS = [
  { label: "ai_assistant_offene_maengel", query: "Welche Mängel sind offen?", icon: "warning" as const },
  { label: "ai_assistant_ueberfaellige_aufgaben", query: "Welche Aufgaben sind überfällig?", icon: "schedule" as const },
  { label: "ai_assistant_kritische_gewerke", query: "Welche Gewerke sind kritisch?", icon: "priority-high" as const },
  { label: "ai_assistant_tageszusammenfassung", query: "Tageszusammenfassung", icon: "today" as const },
  { label: "ai_assistant_wochenbericht", query: "Wochenbericht", icon: "date-range" as const },
  { label: "ai_assistant_baufortschritt", query: "Wie ist der Baufortschritt?", icon: "trending-up" as const },
  { label: "ai_assistant_raumstatus", query: "Welche Räume sind fertig?", icon: "meeting-room" as const },
  { label: "ai_assistant_projektuebersicht", query: "Projektübersicht", icon: "dashboard" as const },
];

// ─── Constants ──────────────────────────────────────────────────────────────

const HISTORY_KEY = "construction_brain_history";
const MAX_HISTORY = 50;

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConstructionBrainScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const colors = useColors();
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);

  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentResponse, setCurrentResponse] = useState<BrainResponse | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function loadActiveProject() {
    if (params.projectId && params.projectName) {
      setActiveProject({ id: params.projectId, name: params.projectName });
      return;
    }
    try {
      const stored = await AsyncStorage.getItem("active_project");
      if (stored) {
        const proj = JSON.parse(stored);
        setActiveProject({ id: proj.id, name: proj.name });
      }
    } catch {}
  }

  async function loadHistory() {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }

  // ─── Load Project ───────────────────────────────────────────────────────────

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadActiveProject();
      void loadHistory();
    });
  }, []);

  const saveHistory = async (entries: HistoryEntry[]) => {
    try {
      const trimmed = entries.slice(-MAX_HISTORY);
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch {}
  };

  // ─── Ask Question ─────────────────────────────────────────────────────────

  const askQuestion = useCallback(async (question: string) => {
    if (!question.trim() || !activeProject) return;

    setInputText("");
    setIsLoading(true);
    setCurrentResponse(null);
    setShowHistory(false);

    try {
      const response = await constructionBrain.ask(activeProject.id, question.trim());
      setCurrentResponse(response);

      const entry: HistoryEntry = {
        id: `brain_${Date.now()}`,
        question: question.trim(),
        response,
        timestamp: new Date().toISOString(),
      };

      const updated = [...history, entry];
      setHistory(updated);
      await saveHistory(updated);
    } catch  {
      setCurrentResponse({
        intent: "unknown",
        title: t('error'),
        summary: t('ai_assistant_anfrage_fehler' as any),
        details: [],
        suggestions: ["Projektübersicht", "Offene Mängel?"],
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeProject, history]);

  // ─── Clear ────────────────────────────────────────────────────────────────

  const clearHistory = async () => {
    setHistory([]);
    setCurrentResponse(null);
    await AsyncStorage.removeItem(HISTORY_KEY);
  };

  // ─── Render Detail Item ───────────────────────────────────────────────────

  const renderDetail = (detail: BrainResponseDetail, index: number) => {
    const iconMap: Record<string, string> = {
      defect: "warning",
      task: "check-circle-outline",
      observation: "visibility",
      progress: "trending-up",
      info: "info-outline",
    };

    const colorMap: Record<string, string> = {
      defect: "#EF4444",
      task: "#3B82F6",
      observation: "#8B5CF6",
      progress: "#22C55E",
      info: "#6B7280",
    };

    return (
      <View key={index} style={styles.detailItem}>
        <MaterialIcons
          name={(iconMap[detail.type] || "info-outline") as any}
          size={16}
          color={colorMap[detail.type] || "#6B7280"}
        />
        <Text style={styles.detailText}>{detail.content}</Text>
      </View>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="p-0" edges={["left", "right"]}>
      {/* Nativer Header mit garantiertem Zurueck-Button (iOS kann ihn nicht verschlucken) */}
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Construction Brain",
          headerStyle: { backgroundColor: "#0F1A2E" },
          headerTintColor: "#F0F4F8",
          headerTitleStyle: { color: "#F0F4F8" },
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 16, paddingRight: 4 }}>
              <Pressable onPress={() => setShowHistory(!showHistory)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="history" size={22} color={showHistory ? "#5DADE2" : "#8FA3B8"} />
              </Pressable>
              <Pressable onPress={clearHistory} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <MaterialIcons name="delete-outline" size={22} color="#8FA3B8" />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >

        {/* Main Content */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
        >
          {/* No Project Warning */}
          {!activeProject && (
            <View style={styles.warningCard}>
              <MaterialIcons name="info" size={20} color="#F59E0B" />
              <Text style={styles.warningText}>
                {t('ai_assistant_projekt_waehlen_hint' as any)}
              </Text>
            </View>
          )}

          {/* History View */}
          {showHistory && (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>{t('ai_assistant_verlauf' as any)}</Text>
              {history.length === 0 ? (
                <Text style={styles.emptyText}>{t('ai_assistant_keine_fragen' as any)}</Text>
              ) : (
                history.slice(-20).reverse().map(entry => (
                  <Pressable
                    key={entry.id}
                    style={({ pressed }) => [styles.historyItem, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      setCurrentResponse(entry.response);
                      setShowHistory(false);
                    }}
                  >
                    <Text style={styles.historyQuestion}>{entry.question}</Text>
                    <Text style={styles.historyTime}>
                      {new Date(entry.timestamp).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* Quick Actions (when no response shown) */}
          {!currentResponse && !isLoading && !showHistory && (
            <View style={styles.quickActionsSection}>
              <Text style={styles.sectionTitle}>{t('ai_assistant_schnellzugriff' as any)}</Text>
              <View style={styles.quickActionsGrid}>
                {QUICK_ACTIONS.map((action, idx) => (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [styles.quickAction, pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] }]}
                    onPress={() => askQuestion(action.query)}
                  >
                    <MaterialIcons name={action.icon} size={22} color="#5DADE2" />
                    <Text style={styles.quickActionLabel}>{t(action.label as any)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Loading */}
          {isLoading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="small" color="#5DADE2" />
              <Text style={styles.loadingText}>{t('ai_assistant_knowledge_layer' as any)}</Text>
            </View>
          )}

          {/* Response Card */}
          {currentResponse && !isLoading && (
            <View style={styles.responseSection}>
              {/* Title & Summary */}
              <View style={styles.responseHeader}>
                <Text style={styles.responseTitle}>{currentResponse.title}</Text>
                <Text style={styles.responseSummary}>{currentResponse.summary}</Text>
              </View>

              {/* Stats */}
              {currentResponse.stats && Object.keys(currentResponse.stats).length > 0 && (
                <View style={styles.statsRow}>
                  {Object.entries(currentResponse.stats).slice(0, 4).map(([key, value]) => (
                    <View key={key} style={styles.statBadge}>
                      <Text style={styles.statValue}>{String(value)}</Text>
                      <Text style={styles.statLabel}>{key}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Details */}
              {currentResponse.details.length > 0 && (
                <View style={styles.detailsSection}>
                  <Text style={styles.detailsTitle}>{t('ai_assistant_details' as any)}</Text>
                  {currentResponse.details.map((d, i) => renderDetail(d, i))}
                </View>
              )}

              {/* Suggestions */}
              {currentResponse.suggestions && currentResponse.suggestions.length > 0 && (
                <View style={styles.suggestionsSection}>
                  <Text style={styles.suggestionsTitle}>{t('ai_assistant_weitere_fragen' as any)}</Text>
                  <View style={styles.suggestionsRow}>
                    {currentResponse.suggestions.map((s, i) => (
                      <Pressable
                        key={i}
                        style={({ pressed }) => [styles.suggestionChip, pressed && { opacity: 0.7 }]}
                        onPress={() => askQuestion(s)}
                      >
                        <Text style={styles.suggestionText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('ai_assistant_frage_stellen' as any)}
            placeholderTextColor="#6B7280"
            returnKeyType="send"
            onSubmitEditing={() => askQuestion(inputText)}
            editable={!!activeProject}
          />
          <Pressable
            onPress={() => askQuestion(inputText)}
            style={({ pressed }) => [styles.sendButton, pressed && { opacity: 0.7 }]}
            disabled={!inputText.trim() || isLoading || !activeProject}
          >
            <MaterialIcons
              name="send"
              size={20}
              color={inputText.trim() && activeProject ? "#5DADE2" : "#4A5568"}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    backgroundColor: "#0F1A2E",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  headerProject: {
    fontSize: 12,
    color: "#5DADE2",
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: 20,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1C1A00",
    borderWidth: 1,
    borderColor: "#F59E0B33",
    borderRadius: 0,
    padding: 14,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: "#F59E0B",
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8FA3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  // Quick Actions
  quickActionsSection: {
    marginBottom: 20,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickAction: {
    width: "47%",
    backgroundColor: "#1A2332",
    borderWidth: 1,
    borderColor: "#2A3A4E",
    borderRadius: 0,
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#CBD5E1",
    textAlign: "center",
  },
  // Loading
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1A2332",
    borderRadius: 0,
    padding: 16,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 14,
    color: "#8FA3B8",
  },
  // Response
  responseSection: {
    gap: 16,
  },
  responseHeader: {
    backgroundColor: "#1A2332",
    borderRadius: 0,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#5DADE2",
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F0F4F8",
    marginBottom: 6,
  },
  responseSummary: {
    fontSize: 14,
    color: "#CBD5E1",
    lineHeight: 20,
  },
  // Stats
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statBadge: {
    backgroundColor: "#1A2332",
    borderRadius: 0,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    minWidth: 70,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#5DADE2",
  },
  statLabel: {
    fontSize: 10,
    color: "#8FA3B8",
    marginTop: 2,
    textTransform: "capitalize",
  },
  // Details
  detailsSection: {
    backgroundColor: "#1A2332",
    borderRadius: 0,
    padding: 14,
  },
  detailsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8FA3B8",
    marginBottom: 10,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#2A3A4E",
  },
  detailText: {
    flex: 1,
    fontSize: 13,
    color: "#CBD5E1",
    lineHeight: 18,
  },
  // Suggestions
  suggestionsSection: {
    marginTop: 4,
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  suggestionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: "#1A2332",
    borderWidth: 1,
    borderColor: "#5DADE233",
    borderRadius: 0,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  suggestionText: {
    fontSize: 12,
    color: "#5DADE2",
  },
  // History
  historySection: {
    marginBottom: 16,
  },
  historyItem: {
    backgroundColor: "#1A2332",
    borderRadius: 0,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyQuestion: {
    flex: 1,
    fontSize: 13,
    color: "#CBD5E1",
  },
  historyTime: {
    fontSize: 11,
    color: "#6B7280",
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280",
    fontStyle: "italic",
  },
  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1E293B",
    backgroundColor: "#0F1A2E",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#1A2332",
    borderRadius: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#F0F4F8",
    borderWidth: 1,
    borderColor: "#2A3A4E",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: "#1A2332",
    alignItems: "center",
    justifyContent: "center",
  },
});
