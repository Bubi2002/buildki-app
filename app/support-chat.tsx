import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { MaterialIcons } from "@expo/vector-icons";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/language-provider";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function getFaqItems(t: (key: any) => string) { return [
  {
    question: t('faq_q_projekt_erstellen'),
    answer: t('faq_a_projekt_erstellen'),
  },
  {
    question: t('faq_q_aufnahme_starten'),
    answer: t('faq_a_aufnahme_starten'),
  },
  {
    question: "Wie exportiere ich ein PDF?",
    answer: t('faq_a_pdf_export'),
  },
  {
    question: t('faq_q_fotos_aufnahme'),
    answer: t('faq_a_fotos_aufnahme'),
  },
  {
    question: "Wie funktioniert die Offline-Synchronisation?",
    answer: "Aufnahmen werden lokal gespeichert, wenn keine Internetverbindung besteht. Sobald du wieder online bist, werden sie automatisch verarbeitet. Der Status wird in der Protokoll-Liste angezeigt.",
  },
  {
    question: t('faq_q_markierungen'),
    answer: t('faq_a_markierungen'),
  },
  {
    question: t('faq_q_firmenlogo'),
    answer: t('faq_a_firmenlogo'),
  },
  {
    question: t('faq_q_bearbeiten'),
    answer: t('faq_a_bearbeiten'),
  },
  {
    question: t('faq_q_zeiterfassung'),
    answer: t('faq_a_zeiterfassung'),
  },
  {
    question: t('faq_q_offline'),
    answer: t('faq_a_offline'),
  },
  {
    question: "Was kostet ProtoKI?",
    answer: "ProtoKI kostet 10,00 \u20ac + MwSt. pro Monat oder 100,00 \u20ac + MwSt. pro Jahr (2 Monate gratis). Jede Lizenz beginnt mit 14 Tagen kostenloser Testphase.",
  },
  {
    question: "Wie importiere ich ein Video aus WhatsApp?",
    answer: "Du hast zwei M\u00f6glichkeiten: 1) \u00d6ffne Tools \u2192 Video-Import und w\u00e4hle das Video aus der Galerie. 2) Teile das Video direkt aus WhatsApp \u00fcber die iOS-Teilen-Funktion an ProtoKI.",
  },
]; }

export default function SupportChatScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showFAQ, setShowFAQ] = useState(true);

  const supportMutation = trpc.support.chat.useMutation();

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setShowFAQ(false);

    try {
      // Build conversation history for context
      const history = [...messages, userMessage].slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const result = await supportMutation.mutateAsync({ messages: history });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuche es erneut oder schaue in die FAQ-Sektion.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, supportMutation]);

  const handleFAQPress = useCallback((item: { question: string; answer: string }) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: item.question,
      timestamp: new Date(),
    };
    const assistantMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: item.answer,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setShowFAQ(false);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.messageBubbleContainer, isUser ? styles.userBubbleContainer : styles.assistantBubbleContainer]}>
        {!isUser && (
          <View style={[styles.avatarContainer, { backgroundColor: colors.primary + "20" }]}>
            <MaterialIcons name="support-agent" size={18} color={colors.primary} />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser
              ? { backgroundColor: colors.primary, marginLeft: 48 }
              : { backgroundColor: "#1A2A3F", borderWidth: 1, borderColor: "#1E3A5F", marginRight: 48 },
          ]}
        >
          <Text style={[styles.messageText, { color: isUser ? "#FFFFFF" : colors.foreground }]}>
            {item.content}
          </Text>
          <Text style={[styles.messageTime, { color: isUser ? "rgba(255,255,255,0.6)" : colors.muted }]}>
            {item.timestamp.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  }, [colors]);

  const renderFAQ = () => (
    <View style={styles.faqContainer}>
      <View style={[styles.welcomeSection, { borderBottomColor: "#1E3A5F" }]}>
        <View style={[styles.supportIconContainer, { backgroundColor: colors.primary + "15" }]}>
          <MaterialIcons name="support-agent" size={40} color={colors.primary} />
        </View>
        <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>{t('protoki_support')}</Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.muted }]}>
          Wie kann ich dir helfen? Stelle eine Frage oder wähle ein Thema aus.
        </Text>
      </View>

      <Text style={[styles.faqTitle, { color: colors.foreground }]}>{t('haeufige_fragen')}</Text>
      {getFaqItems(t).map((item, index) => (
        <Pressable
          key={index}
          onPress={() => handleFAQPress(item)}
          style={({ pressed }) => [
            styles.faqItem,
            { backgroundColor: "#1A2A3F", borderColor: "#1E3A5F", opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <MaterialIcons name="help-outline" size={18} color={colors.primary} style={{ marginRight: 10, marginTop: 2 }} />
          <Text style={[styles.faqQuestion, { color: colors.foreground }]}>{item.question}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: "#0B1622" }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: "#1E3A5F" }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('kisupport')}</Text>
          <View style={styles.onlineIndicator}>
            <View style={[styles.onlineDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.onlineText, { color: colors.success }]}>{t('online')}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            setMessages([]);
            setShowFAQ(true);
          }}
          style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <MaterialIcons name="refresh" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {/* Chat Content */}
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {showFAQ && messages.length === 0 ? (
          <FlatList
            data={[{ key: "faq" }]}
            renderItem={() => renderFAQ()}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.faqScrollContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              messages.length > 0 ? (
                <Pressable onPress={() => setShowFAQ(true)} style={styles.showFAQButton}>
                  <MaterialIcons name="help" size={16} color={colors.primary} />
                  <Text style={[styles.showFAQText, { color: colors.primary }]}>{t('faq_anzeigen')}</Text>
                </Pressable>
              ) : null
            }
          />
        )}

        {/* Loading indicator */}
        {isLoading && (
          <View style={[styles.typingIndicator, { backgroundColor: "#1A2A3F", borderColor: "#1E3A5F" }]}>
            <View style={[styles.avatarContainer, { backgroundColor: colors.primary + "20" }]}>
              <MaterialIcons name="support-agent" size={14} color={colors.primary} />
            </View>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={[styles.typingText, { color: colors.muted }]}>{t('schreibt')}</Text>
          </View>
        )}

        {/* Input Area */}
        <View style={[styles.inputContainer, { borderTopColor: "#1E3A5F", paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('stelle_eine_frage')}
            placeholderTextColor={colors.muted}
            style={[styles.textInput, { color: colors.foreground, backgroundColor: "#1A2A3F", borderColor: "#1E3A5F" }]}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => sendMessage(inputText)}
            blurOnSubmit
          />
          <Pressable
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isLoading}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor: inputText.trim() && !isLoading ? colors.primary : colors.primary + "40",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons name="send" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  onlineIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  onlineText: {
    fontSize: 11,
    fontWeight: "500",
  },
  clearButton: {
    padding: 8,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  faqScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  messageBubbleContainer: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-end",
  },
  userBubbleContainer: {
    justifyContent: "flex-end",
  },
  assistantBubbleContainer: {
    justifyContent: "flex-start",
  },
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 0,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  typingText: {
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 10,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  welcomeSection: {
    alignItems: "center",
    paddingBottom: 20,
    marginBottom: 20,
    borderBottomWidth: 1,
  },
  supportIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  faqContainer: {
    flex: 1,
  },
  faqTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  faqItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 0,
    marginBottom: 8,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  showFAQButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },
  showFAQText: {
    fontSize: 13,
    fontWeight: "500",
    marginLeft: 4,
  },
});
