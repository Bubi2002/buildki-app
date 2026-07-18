/**
 * protoKI – AI Site Assistant
 * 
 * Knowledge Layer basierter Assistent. Kein klassischer Chat.
 * Fragt ausschließlich den Knowledge Layer, analysiert nie direkt Bilder/Dateien.
 * Conversation Memory: Behält Gesprächskontext über mehrere Nachrichten.
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
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { knowledgeLayer } from "@/lib/knowledge-layer";

// ─── Types ───────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type ConversationMemory = {
  projectId: string;
  messages: Message[];
  lastUpdated: string;
};

const SUGGESTIONS = [
  { icon: "warning", text: "Welche Mängel sind offen?", color: "#FF9800" },
  { icon: "today", text: "Was ist heute passiert?", color: "#5DADE2" },
  { icon: "meeting-room", text: "Welche Räume sind fertig?", color: "#66BB6A" },
  { icon: "priority-high", text: "Welche Aufgaben sind kritisch?", color: "#EF4444" },
  { icon: "engineering", text: "Welche Gewerke fehlen?", color: "#AB47BC" },
  { icon: "summarize", text: "Erstelle einen Wochenbericht.", color: "#FF7043" },
  { icon: "trending-up", text: "Zeige den Baufortschritt.", color: "#00BFA5" },
];

const MEMORY_KEY = "ai-assistant-memory";
const MAX_CONTEXT_MESSAGES = 20;

export default function AIAssistantScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; projectName?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string } | null>(null);

  // tRPC for LLM calls (uses support.chat which accepts messages array)
  const chatMutation = trpc.support.chat.useMutation();

  // Load project
  useEffect(() => {
    if (params.projectId && params.projectName) {
      setActiveProject({ id: params.projectId, name: decodeURIComponent(params.projectName) });
    } else {
      loadActiveProject();
    }
  }, []);

  // Load conversation memory when project changes
  useEffect(() => {
    if (activeProject) {
      loadConversationMemory(activeProject.id);
    }
  }, [activeProject?.id]);

  const loadActiveProject = async () => {
    try {
      const projectsJson = await AsyncStorage.getItem("projects");
      const lastId = await AsyncStorage.getItem("last-selected-project-id");
      if (projectsJson && lastId) {
        const projects = JSON.parse(projectsJson);
        const project = projects.find((p: any) => p.id === lastId);
        if (project) setActiveProject({ id: project.id, name: project.name });
      }
    } catch {}
  };

  const loadConversationMemory = async (projectId: string) => {
    try {
      const stored = await AsyncStorage.getItem(`${MEMORY_KEY}-${projectId}`);
      if (stored) {
        const memory: ConversationMemory = JSON.parse(stored);
        setMessages(memory.messages);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  };

  const saveConversationMemory = async (msgs: Message[]) => {
    if (!activeProject) return;
    try {
      const memory: ConversationMemory = {
        projectId: activeProject.id,
        messages: msgs.slice(-MAX_CONTEXT_MESSAGES),
        lastUpdated: new Date().toISOString(),
      };
      await AsyncStorage.setItem(`${MEMORY_KEY}-${activeProject.id}`, JSON.stringify(memory));
    } catch {}
  };

  const clearConversation = async () => {
    setMessages([]);
    if (activeProject) {
      await AsyncStorage.removeItem(`${MEMORY_KEY}-${activeProject.id}`);
    }
  };

  // ─── Send Message ──────────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || !activeProject) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInputText("");
    setIsLoading(true);

    try {
      // 1. Query Knowledge Layer for context
      const knowledgeContext = await knowledgeLayer.queryForAssistant(
        activeProject.id,
        text.trim()
      );

      // 2. Build conversation context (memory)
      const conversationContext = updatedMessages
        .slice(-10)
        .map(m => `${m.role === "user" ? "Benutzer" : "Assistent"}: ${m.content}`)
        .join("\n");

      // 3. Build prompt with knowledge + conversation memory
      const systemPrompt = buildAssistantPrompt(
        activeProject.name,
        knowledgeContext,
        conversationContext
      );

      // 4. Call LLM via server (support.chat with project context injected)
      const chatMessages = [
        { role: "user" as const, content: `${systemPrompt}\n\nBitte antworte auf die letzte Frage des Benutzers.` },
      ];
      const response = await chatMutation.mutateAsync({ messages: chatMessages });

      // 5. Extract assistant response
      const assistantContent = response.response || "Keine Antwort erhalten.";

      const assistantMsg: Message = {
        id: `msg_${Date.now()}_a`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      await saveConversationMemory(finalMessages);
    } catch (error: any) {
      const errorMsg: Message = {
        id: `msg_${Date.now()}_e`,
        role: "assistant",
        content: "Entschuldigung, ich konnte die Anfrage nicht verarbeiten. Bitte versuche es erneut.",
        timestamp: new Date().toISOString(),
      };
      const finalMessages = [...updatedMessages, errorMsg];
      setMessages(finalMessages);
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function buildAssistantPrompt(
    projectName: string,
    knowledgeContext: string,
    conversationContext: string
  ): string {
    return `Du bist der AI Site Assistant für das Bauprojekt "${projectName}".
Du beantwortest Fragen ausschließlich basierend auf dem Knowledge Layer des Projekts.
Du analysierst NIEMALS direkt Bilder oder Dateien. Du nutzt nur die vorhandenen Daten.

PROJEKT-WISSENSBASIS:
${knowledgeContext}

GESPRÄCHSVERLAUF (für Kontext-Referenzen wie "es", "dort", "davon"):
${conversationContext}

AKTUELLE FRAGE: ${conversationContext.split("\n").pop()?.replace("Benutzer: ", "") || ""}

Antworte auf Deutsch, präzise und hilfreich. Beziehe dich auf konkrete Daten aus der Wissensbasis.
Wenn du etwas nicht weißt, sage es ehrlich.`;
  }



  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="p-0">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="arrow-back" size={24} color="#F0F4F8" />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.headerTitle}>AI Site Assistant</Text>
            {activeProject && (
              <Text style={styles.headerProject}>{activeProject.name}</Text>
            )}
          </View>
          <Pressable onPress={clearConversation} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialIcons name="delete-outline" size={22} color="#8FA3B8" />
          </Pressable>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {/* Welcome Section (shown when no messages) */}
          {messages.length === 0 && (
            <View style={styles.welcomeSection}>
              <View style={styles.welcomeIcon}>
                <MaterialIcons name="smart-toy" size={36} color="#0EA5E9" />
              </View>
              <Text style={styles.welcomeTitle}>
                Hallo{activeProject ? ` – ${activeProject.name}` : ""}
              </Text>
              <Text style={styles.welcomeSubtitle}>
                Frage mich alles über dieses Projekt.
              </Text>
              <Text style={styles.welcomeNote}>
                Ich nutze den Knowledge Layer und behalte den Gesprächskontext.
              </Text>

              {/* Suggestions */}
              <View style={styles.suggestions}>
                {SUGGESTIONS.map((suggestion, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => sendMessage(suggestion.text)}
                    style={({ pressed }) => [styles.suggestionChip, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <MaterialIcons name={suggestion.icon as any} size={16} color={suggestion.color} />
                    <Text style={styles.suggestionText}>{suggestion.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Message Bubbles */}
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageBubble,
                msg.role === "user" ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {msg.role === "assistant" && (
                <View style={styles.assistantIcon}>
                  <MaterialIcons name="smart-toy" size={14} color="#0EA5E9" />
                </View>
              )}
              <View style={[
                styles.bubbleContent,
                msg.role === "user" ? styles.userContent : styles.assistantContent,
              ]}>
                <Text style={[
                  styles.messageText,
                  msg.role === "user" ? styles.userText : styles.assistantText,
                ]}>
                  {msg.content}
                </Text>
              </View>
            </View>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <View style={[styles.messageBubble, styles.assistantBubble]}>
              <View style={styles.assistantIcon}>
                <MaterialIcons name="smart-toy" size={14} color="#0EA5E9" />
              </View>
              <View style={[styles.bubbleContent, styles.assistantContent]}>
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color="#0EA5E9" />
                  <Text style={styles.typingText}>Denke nach...</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            placeholder="Frage stellen..."
            placeholderTextColor="#8FA3B8"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(inputText)}
          />
          <Pressable
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isLoading}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: inputText.trim() ? "#0EA5E9" : "#1E3A5F",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons name="send" size={18} color={inputText.trim() ? "#FFF" : "#8FA3B8"} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#1E3A5F",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#F0F4F8",
  },
  headerProject: {
    fontSize: 11,
    color: "#8FA3B8",
    marginTop: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  // Welcome
  welcomeSection: {
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 20,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#0EA5E920",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F0F4F8",
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: "#8FA3B8",
    marginBottom: 4,
  },
  welcomeNote: {
    fontSize: 11,
    color: "#5A6A7A",
    marginBottom: 20,
  },
  suggestions: {
    width: "100%",
    gap: 6,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionText: {
    fontSize: 13,
    color: "#F0F4F8",
    flex: 1,
  },
  // Messages
  messageBubble: {
    flexDirection: "row",
    marginBottom: 12,
    gap: 8,
  },
  userBubble: {
    justifyContent: "flex-end",
  },
  assistantBubble: {
    justifyContent: "flex-start",
  },
  assistantIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0EA5E915",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bubbleContent: {
    maxWidth: "78%",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userContent: {
    backgroundColor: "#0EA5E9",
    borderBottomRightRadius: 4,
  },
  assistantContent: {
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: "#FFFFFF",
  },
  assistantText: {
    color: "#F0F4F8",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typingText: {
    fontSize: 13,
    color: "#8FA3B8",
  },
  // Input
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#1E3A5F",
    backgroundColor: "#0A1220",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#0F1E30",
    borderWidth: 1,
    borderColor: "#1E3A5F",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: "#F0F4F8",
    maxHeight: 100,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
