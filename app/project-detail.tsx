import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { getFloorPlans } from "@/lib/floor-plan-store";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system/legacy";
import { generateProtocolPdf } from "@/lib/pdf-generator";

type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
};

type Protocol = {
  id: string;
  title: string;
  projectId?: string;
  createdAt: string;
  templateName?: string;
  status: string;
  protocol?: string;
  photos?: string[];
  todos?: any[];
  duration?: number;
  location?: any;
  weather?: string | null;
  protocolNumber?: string;
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [planCount, setPlanCount] = useState(0);
  const [defectCount, setDefectCount] = useState({ open: 0, total: 0 });

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const loadData = async () => {
    try {
      const [projectsData, protocolsData] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("protocols"),
      ]);
      const projectsList: Project[] = JSON.parse(projectsData || "[]");
      const protocolsList: Protocol[] = JSON.parse(protocolsData || "[]");

      const found = projectsList.find((p) => p.id === id);
      setProject(found || null);
      setAllProtocols(protocolsList);
      setProtocols(protocolsList.filter((p) => p.projectId === id));

      // Load floor plan count and defect count
      if (id) {
        const plans = await getFloorPlans(id);
        setPlanCount(plans.length);
        try {
          const { getDefects } = await import("@/lib/defect-store");
          const defects = await getDefects(id);
          const openCount = defects.filter((d: any) => d.status === "offen").length;
          setDefectCount({ open: openCount, total: defects.length });
        } catch {}
      }

      // Set this project as the active project for protocol numbering
      if (id) {
        await AsyncStorage.setItem("last-selected-project-id", id);
      }
    } catch (e) {
      console.error("Error loading project detail:", e);
    }
  };

  const assignProtocol = async (protocolId: string) => {
    try {
      const updated = allProtocols.map((p) =>
        p.id === protocolId ? { ...p, projectId: id } : p
      );
      await AsyncStorage.setItem("protocols", JSON.stringify(updated));
      setAllProtocols(updated);
      setProtocols(updated.filter((p) => p.projectId === id));
      setShowAssignModal(false);
    } catch (e) {
      Alert.alert("Fehler", "Zuordnung fehlgeschlagen.");
    }
  };

  const removeFromProject = async (protocolId: string) => {
    Alert.alert("Entfernen", "Protokoll aus diesem Projekt entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      {
        text: "Entfernen",
        onPress: async () => {
          const updated = allProtocols.map((p) =>
            p.id === protocolId ? { ...p, projectId: undefined } : p
          );
          await AsyncStorage.setItem("protocols", JSON.stringify(updated));
          setAllProtocols(updated);
          setProtocols(updated.filter((p) => p.projectId === id));
        },
      },
    ]);
  };

  const unassignedProtocols = allProtocols.filter((p) => !p.projectId);

  const exportAllAsPdf = async () => {
    if (protocols.length === 0) {
      Alert.alert("Hinweis", "Keine Protokolle zum Exportieren vorhanden.");
      return;
    }

    setIsExporting(true);
    try {
      // Convert photos to base64 for embedding
      const photoBase64Map: Record<string, string[]> = {};
      if (Platform.OS !== 'web') {
        for (const p of protocols) {
          if (p.photos && p.photos.length > 0) {
            const base64Photos: string[] = [];
            for (const photoUri of p.photos.slice(0, 4)) { // max 4 photos per protocol
              try {
                const info = await FileSystem.getInfoAsync(photoUri);
                if (info.exists) {
                  const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: FileSystem.EncodingType.Base64 });
                  base64Photos.push(`data:image/jpeg;base64,${base64}`);
                }
              } catch { /* skip unreadable photos */ }
            }
            if (base64Photos.length > 0) {
              photoBase64Map[p.id] = base64Photos;
            }
          }
        }
      }

      // Generate combined HTML for all protocols
      let combinedHtml = `
        <html><head><meta charset="utf-8"/>
        <style>
          body { font-family: -apple-system, sans-serif; padding: 20px; color: #333; }
          .page-break { page-break-after: always; }
          .protocol-section { margin-bottom: 30px; }
          .protocol-header { background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
          .protocol-header h2 { margin: 0 0 8px 0; font-size: 18px; color: #1a1a1a; }
          .protocol-meta { font-size: 12px; color: #666; }
          .protocol-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
          .project-cover { text-align: center; padding: 80px 20px; }
          .project-cover h1 { font-size: 28px; margin-bottom: 12px; }
          .project-cover p { font-size: 16px; color: #666; }
          .toc { margin: 30px 0; }
          .toc-item { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
          .toc-number { color: #E53935; font-weight: 700; margin-right: 8px; }
          .photos-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
          .photos-grid img { width: 48%; height: auto; max-height: 200px; object-fit: cover; border-radius: 6px; border: 1px solid #eee; }
          .photos-label { font-size: 12px; color: #666; margin-top: 16px; margin-bottom: 8px; font-weight: 600; }
        </style></head><body>
        <div class="project-cover">
          <h1>${project?.name || 'Projekt'}</h1>
          <p>${project?.description || ''}</p>
          <p style="margin-top: 20px; font-size: 14px; color: #999;">
            ${protocols.length} Protokoll${protocols.length !== 1 ? 'e' : ''} &bull;
            Exportiert am ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div class="page-break"></div>
        <div class="toc">
          <h2>Inhaltsverzeichnis</h2>
          ${protocols.map((p, i) => `
            <div class="toc-item">
              ${p.protocolNumber ? `<span class="toc-number">${p.protocolNumber}</span>` : `<span class="toc-number">#${i + 1}</span>`}
              ${p.title} &mdash; ${new Date(p.createdAt).toLocaleDateString('de-DE')}
            </div>
          `).join('')}
        </div>
        <div class="page-break"></div>
      `;

      for (let i = 0; i < protocols.length; i++) {
        const p = protocols[i];
        const date = new Date(p.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
        const time = new Date(p.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

        combinedHtml += `
          <div class="protocol-section">
            <div class="protocol-header">
              <h2>${p.protocolNumber ? `${p.protocolNumber} – ` : ''}${p.templateName || 'Protokoll'}</h2>
              <div class="protocol-meta">
                ${date} um ${time}
                ${p.duration ? ` &bull; Dauer: ${Math.floor((p.duration || 0) / 60)}:${String((p.duration || 0) % 60).padStart(2, '0')}` : ''}
                ${p.weather ? ` &bull; ${p.weather}` : ''}
              </div>
            </div>
            <div class="protocol-body">${(p.protocol || '').replace(/\n/g, '<br/>')}</div>
            ${photoBase64Map[p.id] && photoBase64Map[p.id].length > 0 ? `
              <p class="photos-label">Fotos (${photoBase64Map[p.id].length})</p>
              <div class="photos-grid">
                ${photoBase64Map[p.id].map(b64 => `<img src="${b64}" />`).join('')}
              </div>
            ` : ''}
          </div>
          ${i < protocols.length - 1 ? '<div class="page-break"></div>' : ''}
        `;
      }

      combinedHtml += '</body></html>';

      if (Platform.OS === 'web') {
        Alert.alert('Hinweis', 'PDF-Export ist nur auf dem Handy verfügbar.');
        return;
      }

      const { uri: pdfUri } = await Print.printToFileAsync({
        html: combinedHtml,
        base64: false,
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: `${project?.name || 'Projekt'} – Alle Protokolle`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>Projekt nicht gefunden</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]} className="flex-1">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="arrow-back" size={24} color={colors.foreground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <View style={[styles.headerDot, { backgroundColor: project.color }]} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {project.name}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowAssignModal(true)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <MaterialIcons name="add" size={28} color={colors.primary} />
          </Pressable>
        </View>

        {project.description ? (
          <Text style={[styles.description, { color: colors.muted }]}>{project.description}</Text>
        ) : null}

        {/* Export button */}
        <Pressable
          onPress={exportAllAsPdf}
          disabled={isExporting || protocols.length === 0}
          style={({ pressed }) => [
            styles.exportButton,
            {
              backgroundColor: colors.primary + '10',
              borderColor: colors.primary + '40',
              opacity: pressed || isExporting ? 0.7 : 1,
            },
          ]}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons name="picture-as-pdf" size={20} color={colors.primary} />
          )}
          <Text style={[styles.exportButtonText, { color: colors.primary }]}>
            {isExporting ? 'Wird erstellt...' : `Alle ${protocols.length} Protokolle als PDF`}
          </Text>
          {!isExporting && <MaterialIcons name="chevron-right" size={18} color={colors.primary} />}
        </Pressable>

        {/* Tools */}
        <View style={styles.toolsGrid}>
          <Pressable
            onPress={() => router.push(`/floor-plan?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="map" size={20} color={colors.primary} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Grundriss{planCount > 0 ? ` ${planCount}` : ""}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/defects?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={{ position: "relative" }}>
              <MaterialIcons name="warning" size={20} color={colors.warning} />
              {defectCount.open > 0 && (
                <View style={{ position: "absolute", top: -4, right: -6, backgroundColor: colors.error, borderRadius: 7, minWidth: 14, height: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
                  <Text style={{ fontSize: 9, fontWeight: "700", color: "#FFF" }}>{defectCount.open}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Mängel{defectCount.total > 0 ? ` ${defectCount.total}` : ""}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/diary?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="menu-book" size={20} color={colors.success} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Tagebuch</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/checklists?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="checklist" size={20} color={"#8E24AA"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Checklisten</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/team` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="groups" size={20} color={"#1E88E5"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Team</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/project-stats?id=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="bar-chart" size={20} color={"#00ACC1"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Statistik</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/project-export?id=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="ios-share" size={20} color={"#43A047"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Export</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/photo-gallery?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="photo-library" size={20} color={"#E91E63"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Fotos</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/qr-scanner?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="qr-code-scanner" size={20} color={"#00BCD4"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>QR-Scan</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/time-tracking?projectId=${project.id}&projectName=${encodeURIComponent(project.name)}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="timer" size={20} color={"#FF5722"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Zeit</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/cloud-import?projectId=${project.id}` as any)}
            style={({ pressed }) => [styles.toolBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
          >
            <MaterialIcons name="cloud-download" size={20} color={"#607D8B"} />
            <Text style={[styles.toolBtnText, { color: colors.foreground }]}>Cloud</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{protocols.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Protokolle</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>
              {new Date(project.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Erstellt</Text>
          </View>
        </View>

        {/* Protocols list */}
        <FlatList
          data={protocols}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/protocol-detail?id=${item.id}` as any)}
              onLongPress={() => removeFromProject(item.id)}
              style={({ pressed }) => [
                styles.protocolItem,
                { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.protocolInfo}>
                <Text style={[styles.protocolTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.protocolDate, { color: colors.muted }]}>
                  {new Date(item.createdAt).toLocaleDateString("de-DE")} • {item.templateName || "Freies Protokoll"}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="note-add" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                Noch keine Protokolle zugeordnet.{"\n"}Tippe + um Protokolle hinzuzufügen.
              </Text>
            </View>
          }
        />

        {/* Assign Modal */}
        {showAssignModal && (
          <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAssignModal(false)} />
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Protokoll zuordnen</Text>
                <Pressable onPress={() => setShowAssignModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              {unassignedProtocols.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted, paddingVertical: 30 }]}>
                  Alle Protokolle sind bereits zugeordnet.
                </Text>
              ) : (
                <FlatList
                  data={unassignedProtocols}
                  keyExtractor={(item) => item.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => assignProtocol(item.id)}
                      style={({ pressed }) => [
                        styles.assignItem,
                        { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                      ]}
                    >
                      <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assignTitle, { color: colors.foreground }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.assignDate, { color: colors.muted }]}>
                          {new Date(item.createdAt).toLocaleDateString("de-DE")}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, marginHorizontal: 16 },
  headerDot: { width: 12, height: 12, borderRadius: 6 },
  headerTitle: { fontSize: 18, fontWeight: "700", flex: 1 },
  description: { fontSize: 14, paddingHorizontal: 16, marginBottom: 12 },
  statsRow: { flexDirection: "row", marginHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 18, fontWeight: "700" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, alignSelf: "stretch" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  protocolItem: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  protocolInfo: { flex: 1 },
  protocolTitle: { fontSize: 15, fontWeight: "500", marginBottom: 2 },
  protocolDate: { fontSize: 12 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  assignItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  assignTitle: { fontSize: 15, fontWeight: "500" },
  assignDate: { fontSize: 12 },
  exportButton: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1 },
  exportButtonText: { fontSize: 14, fontWeight: "600", flex: 1 },
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  toolBtnText: { fontSize: 13, fontWeight: "500" },
});
