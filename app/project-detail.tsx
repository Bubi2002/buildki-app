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
import { exportAndShareTasks } from "@/lib/excel-export";
import { generateDefectPdfHtml } from "@/lib/defect-pdf-export";
import { getDefects } from "@/lib/defect-store";
import { useTranslation } from "@/lib/language-provider";

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
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [allProtocols, setAllProtocols] = useState<Protocol[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [planCount, setPlanCount] = useState(0);
  const [defectCount, setDefectCount] = useState({ open: 0, resolved: 0, total: 0 });

  async function loadData() {
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
          const resolvedCount = defects.filter((d: any) => d.status === "erledigt" || d.status === "geschlossen").length;
          setDefectCount({ open: openCount, resolved: resolvedCount, total: defects.length });
        } catch {}
      }

      // Set this project as the active project for protocol numbering
      if (id) {
        await AsyncStorage.setItem("last-selected-project-id", id);
      }
    } catch (e) {
      console.error("Error loading project detail:", e);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const assignProtocol = async (protocolId: string) => {
    try {
      const updated = allProtocols.map((p) =>
        p.id === protocolId ? { ...p, projectId: id } : p
      );
      await AsyncStorage.setItem("protocols", JSON.stringify(updated));
      setAllProtocols(updated);
      setProtocols(updated.filter((p) => p.projectId === id));
      setShowAssignModal(false);
    } catch  {
      Alert.alert(t('alert_fehler'), t('msg_zuordnung_fehlgeschlagen'));
    }
  };

  const removeFromProject = async (protocolId: string) => {
    Alert.alert(t('alert_entfernen'), t('msg_protokoll_aus_diesem_projekt_entfernen'), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_entfernen'),
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

  const handleExcelExport = async () => {
    if (!project) return;
    const success = await exportAndShareTasks(project.id);
    if (!success) {
      Alert.alert(t('hinweis'), t('msg_keine_aufgaben_zum_exportieren_vorhanden'));
    }
  };

  const handleDefectsExport = async () => {
    if (!project) return;
    try {
      const defects = await getDefects(project.id);
      if (defects.length === 0) {
        Alert.alert(t('hinweis'), t('msg_keine_maengel_zum_exportieren_vorhanden'));
        return;
      }
      const html = await generateDefectPdfHtml(project.id, project.name, { includePhotos: true });
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e: any) {
      Alert.alert(t('alert_fehler'), e?.message || t('defects_pdf_export_fehlgeschlagen' as any));
    }
  };

  const exportAllAsPdf = async () => {
    if (protocols.length === 0) {
      Alert.alert(t('hinweis'), t('msg_keine_protokolle_zum_exportieren_vorhanden'));
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
          <h1>${project?.name || t('project_detail_projekt' as any)}</h1>
          <p>${project?.description || ''}</p>
          <p style="margin-top: 20px; font-size: 14px; color: #999;">
            ${protocols.length} ${protocols.length !== 1 ? t('project_detail_protokolle' as any) : t('project_detail_protokoll_singular' as any)} &bull;
            ${t('project_detail_exportiert_am' as any)}${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div class="page-break"></div>
        <div class="toc">
          <h2>${t('inhaltsverzeichnis' as any)}</h2>
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
              <h2>${p.protocolNumber ? `${p.protocolNumber} – ` : ''}${p.templateName || t('project_detail_protokoll' as any)}</h2>
              <div class="protocol-meta">
                ${date} ${t('project_detail_um' as any)} ${time}
                ${p.duration ? ` &bull; ${t('project_detail_dauer' as any)}${Math.floor((p.duration || 0) / 60)}:${String((p.duration || 0) % 60).padStart(2, '0')}` : ''}
                ${p.weather ? ` &bull; ${p.weather}` : ''}
              </div>
            </div>
            <div class="protocol-body">${(p.protocol || '').replace(/\n/g, '<br/>')}</div>
            ${photoBase64Map[p.id] && photoBase64Map[p.id].length > 0 ? `
              <p class="photos-label">${t('project_detail_fotos' as any)} (${photoBase64Map[p.id].length})</p>
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
        Alert.alert(t('hinweis'), t('msg_pdfexport_ist_nur_auf_dem_2'));
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
          dialogTitle: `${project?.name || t('project_detail_projekt' as any)} – ${t('project_detail_alle_protokolle' as any)}`,
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert(t('alert_fehler'), t('msg_pdf_konnte_nicht_erstellt_werden'));
    } finally {
      setIsExporting(false);
    }
  };

  const exportAllAsZip = async () => {
    if (protocols.length === 0) {
      Alert.alert(t('hinweis'), t('msg_keine_protokolle_zum_exportieren_vorhanden'));
      return;
    }

    setIsExportingZip(true);
    try {
      if (Platform.OS === 'web') {
        Alert.alert(t('hinweis'), t('msg_zipexport_ist_nur_auf_dem'));
        return;
      }

      // Create a temp directory for individual PDFs
      const zipDir = `${FileSystem.cacheDirectory}zip-export-${Date.now()}/`;
      await FileSystem.makeDirectoryAsync(zipDir, { intermediates: true });

      const pdfPaths: string[] = [];

      // Generate individual PDFs for each protocol
      for (const p of protocols) {
        try {
          // Load full protocol data from AsyncStorage
          const fullProtocolData = await AsyncStorage.getItem(`protocol-${p.id}`);
          const fullProtocol = fullProtocolData ? JSON.parse(fullProtocolData) : p;

          const pdfUri = await generateProtocolPdf({
            title: fullProtocol.title || p.title,
            protocol: fullProtocol.protocol || p.protocol || '',
            templateName: fullProtocol.templateName || p.templateName,
            templateId: fullProtocol.templateId,
            photos: fullProtocol.photos || p.photos || [],
            photoTimestamps: fullProtocol.photoTimestamps,
            transcriptionSegments: fullProtocol.transcriptionSegments,
            photoCaptions: fullProtocol.photoCaptions,
            todos: fullProtocol.todos || p.todos || [],
            duration: fullProtocol.duration || p.duration || 0,
            createdAt: fullProtocol.createdAt || p.createdAt,
            location: fullProtocol.location || p.location,
            weather: fullProtocol.weather || p.weather,
            protocolNumber: fullProtocol.protocolNumber || p.protocolNumber,
            projectName: project?.name,
            projectColor: project?.color,
            planData: fullProtocol.planData,
            signaturePaths: fullProtocol.signaturePaths,
            signatures: fullProtocol.signatures,
            checklistResults: fullProtocol.checklistResults,
          });

          if (pdfUri) {
            // Copy to zip directory with meaningful name
            const filename = pdfUri.split('/').pop() || `protokoll-${p.id}.pdf`;
            const destPath = zipDir + filename;
            await FileSystem.copyAsync({ from: pdfUri, to: destPath });
            pdfPaths.push(destPath);
          }
        } catch (e) {
          console.warn(`[ZIP-Export] Failed to generate PDF for protocol ${p.id}:`, e);
        }
      }

      if (pdfPaths.length === 0) {
        Alert.alert(t('alert_fehler'), t('msg_keine_pdfs_konnten_erstellt_werden'));
        return;
      }

      // Since we can't create a real ZIP on native without a library,
      // share all PDFs sequentially or share the directory
      // Best approach: share each PDF one by one, or share the first and inform user
      if (pdfPaths.length === 1) {
        await Sharing.shareAsync(pdfPaths[0], {
          mimeType: 'application/pdf',
          dialogTitle: `${project?.name || t('project_detail_projekt' as any)} \u2013 ${t('project_detail_protokoll' as any)}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        // On iOS, we can share multiple files by sharing the directory
        // But expo-sharing only supports single files, so we share them one at a time
        // Alternative: create a combined PDF instead
        Alert.alert(
          `${pdfPaths.length} ${t('project_detail_pdfs_erstellt' as any)}`,
          t('project_detail_pdfs_share_message' as any),
          [
            {
              text: t('project_detail_alle_teilen' as any),
              onPress: async () => {
                for (const path of pdfPaths) {
                  try {
                    await Sharing.shareAsync(path, {
                      mimeType: 'application/pdf',
                      dialogTitle: path.split('/').pop()?.replace('.pdf', '') || t('project_detail_protokoll' as any),
                      UTI: 'com.adobe.pdf',
                    });
                  } catch { /* user cancelled */ }
                }
              },
            },
            {
              text: t('project_detail_erstes_teilen' as any),
              onPress: async () => {
                await Sharing.shareAsync(pdfPaths[0], {
                  mimeType: 'application/pdf',
                  dialogTitle: pdfPaths[0].split('/').pop()?.replace('.pdf', '') || t('project_detail_protokoll' as any),
                  UTI: 'com.adobe.pdf',
                });
              },
            },
            { text: t('btn_abbrechen'), style: 'cancel' },
          ]
        );
      }
    } catch (error) {
      console.error('ZIP export error:', error);
      Alert.alert(t('alert_fehler'), t('msg_export_konnte_nicht_erstellt_werden'));
    } finally {
      setIsExportingZip(false);
    }
  };

  if (!project) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>{t('projekt_nicht_gefunden')}</Text>
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

        {/* Gesamter Projektinhalt nutzt einen einzigen vertikalen Scrollcontainer. */}
        <FlatList
          data={protocols}
          keyExtractor={(item) => item.id}
          style={styles.projectScroll}
          contentContainerStyle={styles.projectScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          ListHeaderComponent={(
            <>
        {project.description ? (
          <Text style={[styles.description, { color: colors.muted }]}>{project.description}</Text>
        ) : null}

        {/* Progress Bar */}
        {(defectCount.total > 0 || protocols.length > 0) && (
          <View style={{ marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 0, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{t('projektfortschritt')}</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: defectCount.total > 0 ? (defectCount.resolved === defectCount.total ? colors.success : colors.primary) : colors.muted }}>
                {defectCount.total > 0 ? Math.round((defectCount.resolved / defectCount.total) * 100) : 0}%
              </Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: defectCount.resolved === defectCount.total && defectCount.total > 0 ? colors.success : colors.primary, width: defectCount.total > 0 ? `${Math.round((defectCount.resolved / defectCount.total) * 100)}%` : "0%" }} />
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>{protocols.length} {t('project_detail_protokolle' as any)}</Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>{defectCount.resolved}/{defectCount.total} {t('project_detail_maengel_erledigt' as any)}</Text>
            </View>
          </View>
        )}

        {/* Export buttons */}
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
            {isExporting ? t('project_detail_wird_erstellt' as any) : t('project_detail_alle_als_sammel_pdf' as any)}
          </Text>
          {!isExporting && <MaterialIcons name="chevron-right" size={18} color={colors.primary} />}
        </Pressable>

        <Pressable
          onPress={exportAllAsZip}
          disabled={isExportingZip || protocols.length === 0}
          style={({ pressed }) => [
            styles.exportButton,
            {
              backgroundColor: '#4CAF50' + '10',
              borderColor: '#4CAF50' + '40',
              opacity: pressed || isExportingZip ? 0.7 : 1,
              marginTop: 8,
            },
          ]}
        >
          {isExportingZip ? (
            <ActivityIndicator size="small" color="#4CAF50" />
          ) : (
            <MaterialIcons name="folder-zip" size={20} color="#4CAF50" />
          )}
          <Text style={[styles.exportButtonText, { color: '#4CAF50' }]}>
            {isExportingZip ? t('project_detail_wird_erstellt' as any) : `${t('project_detail_einzelne_pdfs_exportieren' as any)} (${protocols.length})`}
          </Text>
          {!isExportingZip && <MaterialIcons name="chevron-right" size={18} color="#4CAF50" />}
        </Pressable>

                {/* Tools Grid - Professional 3-column layout */}
        <View style={styles.toolsSection}>
          <Text style={[styles.toolsSectionTitle, { color: colors.muted }]}>{t('werkzeuge')}</Text>
          <View style={styles.toolsGrid}>
            <Pressable
              onPress={() => router.push(`/rooms?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#5C6BC015' }]}>
                <MaterialIcons name="layers" size={22} color="#5C6BC0" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('matterport_raeume')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/floor-plan?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#4FC3F715' }]}>
                <MaterialIcons name="map" size={22} color="#4FC3F7" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('grundriss')}</Text>
              {planCount > 0 && <Text style={[styles.toolCardBadge, { color: colors.muted }]}>{planCount}</Text>}
            </Pressable>
            <Pressable
              onPress={() => router.push(`/defects?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#FF980015' }]}>
                <MaterialIcons name="warning" size={22} color="#FF9800" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('maengel')}</Text>
              {defectCount.open > 0 && (
                <View style={[styles.toolBadge, { backgroundColor: colors.error }]}>
                  <Text style={styles.toolBadgeText}>{defectCount.open}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => router.push(`/diary?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#66BB6A15' }]}>
                <MaterialIcons name="menu-book" size={22} color="#66BB6A" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('tagebuch')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/checklists?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#AB47BC15' }]}>
                <MaterialIcons name="checklist" size={22} color="#AB47BC" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('checklist_title')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/team` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#5C6BC015' }]}>
                <MaterialIcons name="groups" size={22} color="#5C6BC0" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('team_title')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/attendance?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#00897B15' }]}>
                <MaterialIcons name="how-to-reg" size={22} color="#00897B" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('anwesenheit' as any)}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/project-stats?id=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#26A69A15' }]}>
                <MaterialIcons name="bar-chart" size={22} color="#26A69A" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('statistik')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/photo-gallery?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#EC407A15' }]}>
                <MaterialIcons name="photo-library" size={22} color="#EC407A" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('gallery_photos')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/qr-scanner?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#00BCD415' }]}>
                <MaterialIcons name="qr-code-scanner" size={22} color="#00BCD4" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('qrscan')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/time-tracking?projectId=${project.id}&projectName=${encodeURIComponent(project.name)}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#FF572215' }]}>
                <MaterialIcons name="timer" size={22} color="#FF5722" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('zeit')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/cloud-import?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#607D8B15' }]}>
                <MaterialIcons name="cloud-download" size={22} color="#607D8B" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('cloud')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/project-export?id=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#43A04715' }]}>
                <MaterialIcons name="ios-share" size={22} color="#43A047" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('export')}</Text>
            </Pressable>
            <Pressable
              onPress={handleExcelExport}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#2E7D3215' }]}>
                <MaterialIcons name="table-chart" size={22} color="#2E7D32" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('excel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleDefectsExport}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#EF444415' }]}>
                <MaterialIcons name="picture-as-pdf" size={22} color="#EF4444" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('maengelpdf')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/protocol-merge?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#7C3AED15' }]}>
                <MaterialIcons name="merge-type" size={22} color="#7C3AED" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('bericht')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/photo-compare?projectId=${project.id}` as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#5C6BC015' }]}>
                <MaterialIcons name="compare" size={22} color="#5C6BC0" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('vergleich')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/calendar-view" as any)}
              style={({ pressed }) => [styles.toolCard, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.toolIconBg, { backgroundColor: '#EF6C0015' }]}>
                <MaterialIcons name="calendar-today" size={22} color="#EF6C00" />
              </View>
              <Text style={[styles.toolCardLabel, { color: colors.foreground }]}>{t('kalender')}</Text>
            </Pressable>
          </View>
        </View>
{/* Stats */}
        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{protocols.length}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{t('project_protocols')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>
              {new Date(project.createdAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
            </Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>{t('project_sort_created')}</Text>
          </View>
        </View>
            </>
          )}
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
                  {new Date(item.createdAt).toLocaleDateString("de-DE")} • {item.templateName || t('project_detail_freies_protokoll' as any)}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="note-add" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.muted }]}>
                {t('project_detail_keine_protokolle_zugeordnet' as any)}{"\n"}{t('project_detail_tippe_hinzufuegen' as any)}
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
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('protokoll_zuordnen')}</Text>
                <Pressable onPress={() => setShowAssignModal(false)}>
                  <MaterialIcons name="close" size={24} color={colors.muted} />
                </Pressable>
              </View>
              {unassignedProtocols.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.muted, paddingVertical: 30 }]}>
                  {t('project_detail_alle_bereits_zugeordnet' as any)}
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
  headerDot: { width: 12, height: 12, borderRadius: 0 },
  headerTitle: { fontSize: 20, fontWeight: "800", flex: 1 },
  description: { fontSize: 14, paddingHorizontal: 16, marginBottom: 12 },
  statsRow: { flexDirection: "row", marginHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 },
  stat: { flex: 1, alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, alignSelf: "stretch" },
  projectScroll: { flex: 1 },
  projectScrollContent: { paddingBottom: 120 },
  protocolItem: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 0, borderWidth: 1, marginHorizontal: 16, marginBottom: 8 },
  protocolInfo: { flex: 1 },
  protocolTitle: { fontSize: 16, fontWeight: "600", marginBottom: 3 },
  protocolDate: { fontSize: 13 },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 16, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  modalOverlay: { justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  assignItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  assignTitle: { fontSize: 15, fontWeight: "500" },
  assignDate: { fontSize: 12 },
  exportButton: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 0, borderWidth: 1 },
  exportButtonText: { fontSize: 14, fontWeight: "600", flex: 1 },
  toolsSection: { paddingHorizontal: 16, marginBottom: 16 },
  toolsSectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 },
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  toolCard: { width: "30.5%", alignItems: "center", paddingVertical: 14, minHeight: 72, borderRadius: 0, position: "relative" },
  toolIconBg: { width: 44, height: 44, borderRadius: 0, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  toolCardLabel: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  toolCardBadge: { fontSize: 10, marginTop: 2 },
  toolBadge: { position: "absolute", top: 6, right: "20%", minWidth: 16, height: 16, borderRadius: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  toolBadgeText: { fontSize: 9, fontWeight: "700", color: "#FFFFFF" },
});
