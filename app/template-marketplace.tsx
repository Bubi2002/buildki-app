import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useTranslation } from "@/lib/language-provider";
import {
  getMarketplaceTemplates,
  importTemplate,
  rateTemplate,
  type MarketplaceTemplate,
} from "@/lib/template-marketplace";

type CategoryFilter = "alle" | "baustelle" | "buero" | "allgemein" | "technik" | "recht";

function getCategories(t: (key: any) => string) { return [
  { key: "alle", label: t('cat_alle'), icon: "apps" },
  { key: "baustelle", label: t('cat_baustelle'), icon: "construction" },
  { key: "buero", label: t('cat_buero'), icon: "business" },
  { key: "technik", label: t('cat_technik'), icon: "engineering" },
  { key: "recht", label: t('cat_recht'), icon: "gavel" },
  { key: "allgemein", label: t('cat_allgemein'), icon: "category" },
]; }

export default function TemplateMarketplaceScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("alle");
  const [selectedTemplate, setSelectedTemplate] = useState<MarketplaceTemplate | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [])
  );

  const loadTemplates = async () => {
    try {
      const data = await getMarketplaceTemplates();
      setTemplates(data);
    } catch (error) {
      console.error("Error loading marketplace:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (template: MarketplaceTemplate) => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await importTemplate(template);
    Alert.alert(t('alert_importiert_ex'), `"${template.name}" wurde zu deinen Vorlagen hinzugefügt.`);
    loadTemplates();
  };

  const handleRate = async (template: MarketplaceTemplate, rating: number) => {
    await rateTemplate(template.id, rating);
    loadTemplates();
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = !search || 
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = category === "alle" || t.category === category;
    return matchesSearch && matchesCategory;
  });

  const renderTemplate = ({ item }: { item: MarketplaceTemplate }) => (
    <Pressable
      onPress={() => { setSelectedTemplate(item); setShowDetail(true); }}
      style={({ pressed }) => [
        styles.templateCard,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primary + "15" }]}>
          <MaterialIcons name={item.icon as any} size={22} color={colors.primary} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name}</Text>
          <Text style={[styles.cardAuthor, { color: colors.muted }]}>{item.author}</Text>
        </View>
        <View style={styles.ratingBadge}>
          <MaterialIcons name="star" size={14} color="#F59E0B" />
          <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
        </View>
      </View>
      <Text style={[styles.cardDesc, { color: colors.muted }]} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardFooter}>
        <View style={styles.tagRow}>
          {item.tags.slice(0, 3).map(tag => (
            <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + "10" }]}>
              <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.downloads, { color: colors.muted }]}>
          <MaterialIcons name="download" size={12} color={colors.muted} /> {item.downloads}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{t('vorlagenmarktplatz')}</Text>
        <Pressable onPress={() => router.push("/template-editor")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <MaterialIcons name="add" size={24} color={colors.primary} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('vorlagen_suchen')}
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")}>
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Categories */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryContent}>
        {getCategories(t).map(cat => (
          <Pressable
            key={cat.key}
            onPress={() => setCategory(cat.key as CategoryFilter)}
            style={[
              styles.categoryChip,
              { 
                backgroundColor: category === cat.key ? colors.primary : colors.surface,
                borderColor: category === cat.key ? colors.primary : colors.border,
              }
            ]}
          >
            <MaterialIcons name={cat.icon as any} size={14} color={category === cat.key ? "#fff" : colors.muted} />
            <Text style={[styles.categoryText, { color: category === cat.key ? "#fff" : colors.foreground }]}>{cat.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Template List */}
      <FlatList
        data={filteredTemplates}
        keyExtractor={item => item.id}
        renderItem={renderTemplate}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="search-off" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t('keine_vorlagen_gefunden')}</Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {selectedTemplate && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>{selectedTemplate.name}</Text>
                  <Pressable onPress={() => setShowDetail(false)}>
                    <MaterialIcons name="close" size={24} color={colors.foreground} />
                  </Pressable>
                </View>
                <ScrollView style={styles.modalBody}>
                  <View style={styles.modalMeta}>
                    <View style={[styles.iconCircleLarge, { backgroundColor: colors.primary + "15" }]}>
                      <MaterialIcons name={selectedTemplate.icon as any} size={32} color={colors.primary} />
                    </View>
                    <View style={styles.metaInfo}>
                      <Text style={[styles.metaAuthor, { color: colors.muted }]}>von {selectedTemplate.author}</Text>
                      <View style={styles.metaRow}>
                        <MaterialIcons name="star" size={16} color="#F59E0B" />
                        <Text style={{ color: colors.foreground, fontWeight: "600" }}>{selectedTemplate.rating.toFixed(1)}</Text>
                        <Text style={{ color: colors.muted, marginLeft: 12 }}>{selectedTemplate.downloads} Downloads</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={[styles.modalDesc, { color: colors.foreground }]}>{selectedTemplate.description}</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('struktur')}</Text>
                  <Text style={[styles.promptPreview, { color: colors.muted, backgroundColor: colors.surface }]}>
                    {selectedTemplate.systemPrompt}
                  </Text>
                  <View style={styles.tagRow}>
                    {selectedTemplate.tags.map(tag => (
                      <View key={tag} style={[styles.tag, { backgroundColor: colors.primary + "10" }]}>
                        <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => { handleImport(selectedTemplate); setShowDetail(false); }}
                    style={[styles.importButton, { backgroundColor: colors.primary }]}
                  >
                    <MaterialIcons name="download" size={18} color="#fff" />
                    <Text style={styles.importButtonText}>{t('importieren')}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  title: { fontSize: 18, fontWeight: "700" },
  searchContainer: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 0, borderWidth: 0.5, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  categoryScroll: { maxHeight: 44, marginBottom: 8 },
  categoryContent: { paddingHorizontal: 16, gap: 8 },
  categoryChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 0, borderWidth: 0.5 },
  categoryText: { fontSize: 12, fontWeight: "500" },
  list: { padding: 16, gap: 12 },
  templateCard: { padding: 14, borderRadius: 0, borderWidth: 0.5, gap: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 0, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  cardAuthor: { fontSize: 11, marginTop: 2 },
  ratingBadge: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingText: { fontSize: 12, fontWeight: "600", color: "#F59E0B" },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 0 },
  tagText: { fontSize: 10, fontWeight: "500" },
  downloads: { fontSize: 11 },
  emptyContainer: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 0.5, maxHeight: "85%", paddingBottom: 30 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  modalTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  modalBody: { padding: 16 },
  modalMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  iconCircleLarge: { width: 56, height: 56, borderRadius: 0, alignItems: "center", justifyContent: "center" },
  metaInfo: { flex: 1, gap: 4 },
  metaAuthor: { fontSize: 13 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  modalDesc: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  promptPreview: { fontSize: 12, lineHeight: 18, padding: 12, borderRadius: 0, marginBottom: 12 },
  modalActions: { padding: 16, borderTopWidth: 0.5, borderTopColor: "#e5e7eb" },
  importButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 0 },
  importButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
