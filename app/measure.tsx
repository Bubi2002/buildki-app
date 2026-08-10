import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Circle, Line, Rect, Text as SvgText } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import {
  createEvidenceItem,
  createEvidenceMeasurement,
  getEvidence,
  saveEvidence,
  updateEvidence,
  type EvidenceItem,
  type MeasurementAccuracy,
  type MeasurementMethod,
} from "@/lib/evidence-store";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CANVAS_WIDTH = Math.max(280, SCREEN_WIDTH - 32);
const CANVAS_HEIGHT = Math.min(460, CANVAS_WIDTH * 1.15);
const MEASUREMENT_DIRECTORY = `${FileSystem.documentDirectory || ""}evidence/measurements/`;

const METHODS: {
  value: MeasurementMethod;
  label: string;
  accuracy: MeasurementAccuracy;
  description: string;
}[] = [
  {
    value: "manual_on_site",
    label: "measure_method_manual_on_site_label",
    accuracy: "verified",
    description: "measure_method_manual_on_site_desc",
  },
  {
    value: "reference_scale",
    label: "measure_method_reference_scale_label",
    accuracy: "calibrated",
    description: "measure_method_reference_scale_desc",
  },
  {
    value: "ar",
    label: "measure_method_ar_label",
    accuracy: "calibrated",
    description: "measure_method_ar_desc",
  },
  {
    value: "lidar",
    label: "measure_method_lidar_label",
    accuracy: "calibrated",
    description: "measure_method_lidar_desc",
  },
  {
    value: "plan_scale",
    label: "measure_method_plan_scale_label",
    accuracy: "calibrated",
    description: "measure_method_plan_scale_desc",
  },
  {
    value: "image_estimate",
    label: "measure_method_image_estimate_label",
    accuracy: "estimated",
    description: "measure_method_image_estimate_desc",
  },
];

const UNITS = ["mm", "cm", "m", "in", "ft", "yd", "m²", "ft²", "yd²", "°", "Stk."] as const;
type Unit = (typeof UNITS)[number];

type ProjectRef = { id: string; name: string };
type Point = { x: number; y: number };

export default function MeasureScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const canvasRef = useRef<View>(null);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<Unit>("cm");
  const [method, setMethod] = useState<MeasurementMethod>("manual_on_site");
  const [tolerance, setTolerance] = useState("");
  const [findingText, setFindingText] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedMethod = useMemo(
    () => METHODS.find((item) => item.value === method) || METHODS[0],
    [method],
  );

  async function loadProjectAndEvidence() {
    try {
      const [projectsJson, selectedProjectId] = await Promise.all([
        AsyncStorage.getItem("projects"),
        AsyncStorage.getItem("last-selected-project-id"),
      ]);
      const projects: ProjectRef[] = projectsJson ? JSON.parse(projectsJson) : [];
      const active = projects.find((item) => item.id === selectedProjectId) || null;
      setProject(active);
      setEvidence(active ? await getEvidence(active.id) : []);
    } catch {
      setProject(null);
      setEvidence([]);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadProjectAndEvidence();
    });
  }, []);

  const selectEvidence = (item: EvidenceItem) => {
    setSelectedEvidence(item);
    setFindingText(item.findingText || "");
    setStartPoint(null);
    setEndPoint(null);
  };

  async function addPhoto(source: "camera" | "library") {
    if (!project) {
      Alert.alert(t('measure_alert_kein_projekt_title' as any), t('measure_alert_kein_projekt_msg' as any));
      return;
    }

    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert(t('measure_alert_berechtigung_title' as any), t('measure_alert_berechtigung_msg' as any));
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
            allowsMultipleSelection: false,
          });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const item = createEvidenceItem({
      projectId: project.id,
      sourceType: "photo",
      originalUri: asset.uri,
      sourceFilename: asset.fileName || undefined,
      pixelWidth: asset.width,
      pixelHeight: asset.height,
      mediaQuality:
        Math.min(asset.width || 0, asset.height || 0) >= 720
          ? "suitable"
          : "review_required",
      mediaQualityNote:
        Math.min(asset.width || 0, asset.height || 0) >= 720
          ? t('measure_media_quality_suitable' as any)
          : t('measure_media_quality_review' as any),
      reviewStatus: "pending",
    });
    await saveEvidence(item);
    setEvidence((current) => [item, ...current]);
    selectEvidence(item);
  }

  const drawingGesture = Gesture.Pan()
    .onStart((event) => {
      setStartPoint({ x: event.x, y: event.y });
      setEndPoint({ x: event.x, y: event.y });
    })
    .onUpdate((event) => {
      setEndPoint({ x: event.x, y: event.y });
    })
    .runOnJS(true);

  async function ensureMeasurementDirectory() {
    if (!FileSystem.documentDirectory) {
      throw new Error(t('measure_error_directory_unavailable' as any));
    }
    const info = await FileSystem.getInfoAsync(MEASUREMENT_DIRECTORY);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(MEASUREMENT_DIRECTORY, {
        intermediates: true,
      });
    }
  }

  async function saveMeasurement() {
    if (!selectedEvidence || !startPoint || !endPoint) {
      Alert.alert(t('measure_alert_messstrecke_title' as any), t('measure_alert_messstrecke_msg' as any));
      return;
    }
    const numericValue = Number(value.replace(",", "."));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      Alert.alert(t('measure_alert_messwert_title' as any), t('measure_alert_messwert_msg' as any));
      return;
    }
    const numericTolerance = tolerance.trim()
      ? Number(tolerance.replace(",", "."))
      : undefined;
    if (numericTolerance != null && (!Number.isFinite(numericTolerance) || numericTolerance < 0)) {
      Alert.alert(t('measure_alert_toleranz_title' as any), t('measure_alert_toleranz_msg' as any));
      return;
    }

    setIsSaving(true);
    try {
      await ensureMeasurementDirectory();
      const temporaryUri = await captureRef(canvasRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      const measurement = createEvidenceMeasurement({
        kind: unit === "m²" || unit === "ft²" || unit === "yd²" ? "area" : unit === "°" ? "angle" : unit === "Stk." ? "count" : "distance",
        value: numericValue,
        unit,
        method,
        accuracy: selectedMethod.accuracy,
        tolerance: numericTolerance,
        toleranceUnit: numericTolerance != null ? (unit === "m²" || unit === "ft²" || unit === "yd²" || unit === "Stk." ? "%" : unit) : undefined,
        geometry: {
          points: [
            { x: startPoint.x / CANVAS_WIDTH, y: startPoint.y / CANVAS_HEIGHT },
            { x: endPoint.x / CANVAS_WIDTH, y: endPoint.y / CANVAS_HEIGHT },
          ],
        },
        note,
      });
      const destination = `${MEASUREMENT_DIRECTORY}${selectedEvidence.id}_${measurement.id}.png`;
      await FileSystem.copyAsync({ from: temporaryUri, to: destination });
      const updated = await updateEvidence(selectedEvidence.id, {
        previewUri: destination,
        findingText,
        reviewStatus: "approved",
        measurements: [...(selectedEvidence.measurements || []), measurement],
      });
      if (!updated) throw new Error(t('measure_error_update_failed' as any));
      setSelectedEvidence(updated);
      setEvidence((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      Alert.alert(
        t('measure_alert_saved_title' as any),
        selectedMethod.accuracy === "estimated"
          ? t('measure_alert_saved_estimate' as any)
          : t('measure_alert_saved_full' as any),
      );
      setStartPoint(null);
      setEndPoint(null);
      setValue("");
      setTolerance("");
      setNote("");
    } catch (error) {
      Alert.alert(
        t('measure_alert_save_failed_title' as any),
        error instanceof Error ? error.message : t('measure_alert_save_failed_msg' as any),
      );
    } finally {
      setIsSaving(false);
    }
  }

  const measurementLabel = value.trim()
    ? `${value.replace(".", ",")} ${unit}${selectedMethod.accuracy === "estimated" ? t('measure_label_estimate_suffix' as any) : ""}`
    : t('measure_label_messwert' as any);

  return (
    <ScreenContainer className="p-0">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel={t('measure_a11y_close' as any)}>
          <MaterialIcons name="arrow-back" size={26} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground }]}>{t('measure_title' as any)}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
            {project?.name || t('measure_project_placeholder' as any)}
          </Text>
        </View>
        <MaterialIcons name="straighten" size={26} color="#00ACC1" />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!project ? (
          <View style={[styles.notice, { borderColor: colors.warning }]}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>{t('measure_no_project_title' as any)}</Text>
            <Text style={[styles.noticeText, { color: colors.muted }]}>{t('measure_no_project_text' as any)}</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('measure_section_select_record' as any)}</Text>
            <View style={styles.sourceButtons}>
              <Pressable style={[styles.sourceButton, { borderColor: colors.border }]} onPress={() => void addPhoto("camera")}>
                <MaterialIcons name="photo-camera" size={22} color="#00ACC1" />
                <Text style={[styles.sourceButtonText, { color: colors.foreground }]}>{t('measure_take_photo' as any)}</Text>
              </Pressable>
              <Pressable style={[styles.sourceButton, { borderColor: colors.border }]} onPress={() => void addPhoto("library")}>
                <MaterialIcons name="photo-library" size={22} color="#00ACC1" />
                <Text style={[styles.sourceButtonText, { color: colors.foreground }]}>{t('measure_from_records' as any)}</Text>
              </Pressable>
            </View>

            {evidence.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evidenceStrip}>
                {evidence.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => selectEvidence(item)}
                    style={[
                      styles.evidenceCard,
                      {
                        borderColor: selectedEvidence?.id === item.id ? "#00ACC1" : colors.border,
                        backgroundColor: colors.surface,
                      },
                    ]}
                  >
                    <Image source={{ uri: item.previewUri || item.originalUri }} style={styles.evidenceImage} contentFit="cover" />
                    <Text style={[styles.evidenceCaption, { color: colors.foreground }]} numberOfLines={2}>
                      {item.findingText || (item.sourceType === "video_frame" ? t('measure_video_frame' as any) : t('measure_photo' as any))}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {selectedEvidence && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('measure_section_draw_line' as any)}</Text>
                <Text style={[styles.helpText, { color: colors.muted }]}>{t('measure_help_text' as any)}</Text>
                <GestureDetector gesture={drawingGesture}>
                  <View ref={canvasRef} collapsable={false} style={styles.canvas}>
                    <Image
                      source={{ uri: selectedEvidence.previewUri || selectedEvidence.originalUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                    />
                    <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
                      {startPoint && endPoint && (
                        <>
                          <Line x1={startPoint.x} y1={startPoint.y} x2={endPoint.x} y2={endPoint.y} stroke="#FF3B30" strokeWidth={4} />
                          <Circle cx={startPoint.x} cy={startPoint.y} r={7} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                          <Circle cx={endPoint.x} cy={endPoint.y} r={7} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                          <Rect x={Math.max(4, (startPoint.x + endPoint.x) / 2 - 58)} y={Math.max(4, (startPoint.y + endPoint.y) / 2 - 30)} width={116} height={25} rx={4} fill="rgba(0,0,0,0.72)" />
                          <SvgText x={(startPoint.x + endPoint.x) / 2} y={Math.max(21, (startPoint.y + endPoint.y) / 2 - 13)} fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle">
                            {measurementLabel}
                          </SvgText>
                        </>
                      )}
                    </Svg>
                  </View>
                </GestureDetector>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_finding_label' as any)}</Text>
                <TextInput
                  value={findingText}
                  onChangeText={setFindingText}
                  placeholder={t('measure_finding_placeholder' as any)}
                  placeholderTextColor={colors.muted}
                  multiline
                  style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                />

                <View style={styles.valueRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_value' as any)}</Text>
                    <TextInput
                      value={value}
                      onChangeText={setValue}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={colors.muted}
                      style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_unit' as any)}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.chipRow}>
                        {UNITS.map((item) => (
                          <Pressable key={item} onPress={() => setUnit(item)} style={[styles.chip, { borderColor: unit === item ? "#00ACC1" : colors.border, backgroundColor: unit === item ? "#00ACC122" : colors.surface }]}>
                            <Text style={{ color: unit === item ? "#00ACC1" : colors.foreground, fontWeight: "600" }}>{item}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_method' as any)}</Text>
                <View style={styles.methodGrid}>
                  {METHODS.map((item) => (
                    <Pressable key={item.value} onPress={() => setMethod(item.value)} style={[styles.methodCard, { borderColor: method === item.value ? "#00ACC1" : colors.border, backgroundColor: method === item.value ? "#00ACC118" : colors.surface }]}>
                      <Text style={[styles.methodLabel, { color: method === item.value ? "#00ACC1" : colors.foreground }]}>{t(item.label as any)}</Text>
                      <Text style={[styles.methodDescription, { color: colors.muted }]}>{t(item.description as any)}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_tolerance' as any)}</Text>
                <TextInput
                  value={tolerance}
                  onChangeText={setTolerance}
                  keyboardType="decimal-pad"
                  placeholder={t('measure_tolerance_placeholder' as any)}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_note' as any)}</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder={t('measure_note_placeholder' as any)}
                  placeholderTextColor={colors.muted}
                  multiline
                  style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                />

                <View style={[styles.qualityBanner, { borderColor: selectedMethod.accuracy === "estimated" ? colors.warning : "#00ACC1" }]}>
                  <MaterialIcons name={selectedMethod.accuracy === "estimated" ? "warning-amber" : "verified"} size={22} color={selectedMethod.accuracy === "estimated" ? colors.warning : "#00ACC1"} />
                  <Text style={[styles.qualityText, { color: colors.foreground }]}>
                    {selectedMethod.accuracy === "estimated"
                      ? t('measure_quality_estimate' as any)
                      : `${t('measure_quality_prefix' as any)}${selectedMethod.accuracy === "verified" ? t('measure_quality_verified' as any) : t('measure_quality_calibrated' as any)}${t('measure_quality_suffix' as any)}`}
                  </Text>
                </View>

                <Pressable
                  onPress={() => void saveMeasurement()}
                  disabled={isSaving}
                  style={({ pressed }) => [styles.saveButton, { opacity: isSaving ? 0.5 : pressed ? 0.8 : 1 }]}
                >
                  <MaterialIcons name="save" size={22} color="#FFFFFF" />
                  <Text style={styles.saveButtonText}>{isSaving ? t('measure_saving' as any) : t('measure_save_record' as any)}</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { height: 74, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  content: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginTop: 18, marginBottom: 10 },
  notice: { borderWidth: 1, padding: 16 },
  noticeTitle: { fontSize: 16, fontWeight: "800" },
  noticeText: { fontSize: 13, marginTop: 6, lineHeight: 19 },
  sourceButtons: { flexDirection: "row", gap: 10 },
  sourceButton: { flex: 1, minHeight: 72, borderWidth: 1, padding: 12, alignItems: "center", justifyContent: "center", gap: 6 },
  sourceButtonText: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  evidenceStrip: { marginTop: 12 },
  evidenceCard: { width: 132, marginRight: 10, borderWidth: 2, padding: 6 },
  evidenceImage: { width: 116, height: 90, backgroundColor: "#111827" },
  evidenceCaption: { fontSize: 11, fontWeight: "700", marginTop: 6, lineHeight: 15 },
  helpText: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, backgroundColor: "#111827", overflow: "hidden", borderWidth: 1, borderColor: "#334155" },
  fieldLabel: { fontSize: 13, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  multiline: { minHeight: 84, paddingTop: 12, textAlignVertical: "top" },
  valueRow: { flexDirection: "row", gap: 12 },
  chipRow: { flexDirection: "row", gap: 6 },
  chip: { minWidth: 48, height: 48, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  methodGrid: { gap: 8 },
  methodCard: { borderWidth: 1, padding: 12 },
  methodLabel: { fontSize: 14, fontWeight: "800" },
  methodDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  qualityBanner: { marginTop: 16, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  qualityText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saveButton: { marginTop: 18, minHeight: 54, backgroundColor: "#00ACC1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
});
