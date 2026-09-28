import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
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
import Svg, { Circle, Line, Rect, Text as SvgText, G } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useTranslation } from "@/lib/language-provider";
import { exportMeasurementPdf } from "@/lib/measure-export";
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
import { getDefects, type Defect } from "@/lib/defect-store";

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

const STEP_DEFS = [
  { n: 1 as const, labelKey: "measure_step_evidence" },
  { n: 2 as const, labelKey: "measure_step_measure" },
  { n: 3 as const, labelKey: "measure_step_document" },
];

const DATE_LOCALE: Record<string, string> = {
  de: "de-DE", en: "en-GB", fr: "fr-FR", es: "es-ES", uk: "uk-UA",
  pl: "pl-PL", ru: "ru-RU", ro: "ro-RO", bg: "bg-BG", tr: "tr-TR",
};

type ProjectRef = { id: string; name: string };
type Point = { x: number; y: number };

export default function MeasureScreen() {
  const { t, language } = useTranslation();
  const colors = useColors();
  const router = useRouter();
  const canvasRef = useRef<View>(null);
  const [project, setProject] = useState<ProjectRef | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [endPoint, setEndPoint] = useState<Point | null>(null);
  // Which endpoint the current drag is moving, and the finger→handle offset so
  // grabbing a handle doesn't snap it to the finger.
  const activeHandleRef = useRef<"start" | "end" | "new">("new");
  const grabOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<Unit>("cm");
  const [method, setMethod] = useState<MeasurementMethod>("manual_on_site");
  const [tolerance, setTolerance] = useState("");
  const [findingText, setFindingText] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [selectedDefectId, setSelectedDefectId] = useState<string | null>(null);
  const [showDefectPicker, setShowDefectPicker] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

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
      setDefects(active ? await getDefects(active.id) : []);
    } catch {
      setProject(null);
      setEvidence([]);
      setDefects([]);
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
    setSelectedDefectId((item as any).defectId || null);
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

  // The image is drawn contentFit="contain", so it occupies a letterboxed
  // sub-rect of the canvas. Measurement handles are clamped to THIS rect so a
  // line can never land on the empty letterbox area outside the actual photo.
  const imageRect = useMemo(() => {
    const iw = imageSize.width;
    const ih = imageSize.height;
    if (!iw || !ih) return { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
    const scale = Math.min(CANVAS_WIDTH / iw, CANVAS_HEIGHT / ih);
    const w = iw * scale;
    const h = ih * scale;
    return { x: (CANVAS_WIDTH - w) / 2, y: (CANVAS_HEIGHT - h) / 2, w, h };
  }, [imageSize]);

  const clampToImage = (p: Point): Point => ({
    x: Math.min(imageRect.x + imageRect.w, Math.max(imageRect.x, p.x)),
    y: Math.min(imageRect.y + imageRect.h, Math.max(imageRect.y, p.y)),
  });

  const drawingGesture = Gesture.Pan()
    .onStart((event) => {
      const touch = { x: event.x, y: event.y };
      // If a line already exists, grabbing near an endpoint moves THAT endpoint
      // (freely, both are independently draggable). Grabbing away from both
      // endpoints starts a fresh line.
      if (startPoint && endPoint) {
        const dStart = Math.hypot(touch.x - startPoint.x, touch.y - startPoint.y);
        const dEnd = Math.hypot(touch.x - endPoint.x, touch.y - endPoint.y);
        const GRAB = 44; // generous touch radius around each handle
        if (dStart <= GRAB && dStart <= dEnd) {
          activeHandleRef.current = "start";
          grabOffsetRef.current = { x: startPoint.x - touch.x, y: startPoint.y - touch.y };
          return;
        }
        if (dEnd <= GRAB) {
          activeHandleRef.current = "end";
          grabOffsetRef.current = { x: endPoint.x - touch.x, y: endPoint.y - touch.y };
          return;
        }
      }
      // New line (clamped to the image area, not the letterbox).
      activeHandleRef.current = "new";
      grabOffsetRef.current = { x: 0, y: 0 };
      const clamped = clampToImage(touch);
      setStartPoint(clamped);
      setEndPoint(clamped);
    })
    .onUpdate((event) => {
      const p = clampToImage({
        x: event.x + grabOffsetRef.current.x,
        y: event.y + grabOffsetRef.current.y,
      });
      if (activeHandleRef.current === "start") setStartPoint(p);
      else setEndPoint(p);
    })
    .runOnJS(true);

  const measurementsList: any[] = selectedEvidence?.measurements || [];

  const fmtMeasureValue = (m: any) => {
    const n = Number(m.value);
    const num = Number.isFinite(n)
      ? n.toLocaleString(language === "de" ? "de-DE" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(m.value);
    return `${num} ${m.unit}`;
  };
  const methodShortLabel = (mv: string) => {
    const found = METHODS.find((x) => x.value === mv);
    return found ? t(found.label as any) : mv;
  };

  // Existing saved measurements rendered as numbered teal lines (M1, M2, ...).
  const savedMeasurementLines = (small = false) =>
    measurementsList.map((m, i) => {
      const pts = m.geometry?.points;
      if (!pts || pts.length < 2) return null;
      const a = { x: pts[0].x * CANVAS_WIDTH, y: pts[0].y * CANVAS_HEIGHT };
      const b = { x: pts[1].x * CANVAS_WIDTH, y: pts[1].y * CANVAS_HEIGHT };
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      return (
        <G key={m.id}>
          <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#00ACC1" strokeWidth={small ? 2.5 : 3} />
          <Circle cx={a.x} cy={a.y} r={small ? 3.5 : 4.5} fill="#00ACC1" />
          <Circle cx={b.x} cy={b.y} r={small ? 3.5 : 4.5} fill="#00ACC1" />
          <Rect x={mx - 15} y={my - 10} width={30} height={18} rx={9} fill="#00ACC1" />
          <SvgText x={mx} y={my + 3} fill="#FFFFFF" fontSize={11} fontWeight="800" textAnchor="middle">{`M${i + 1}`}</SvgText>
        </G>
      );
    });

  const deleteMeasurement = (id: string) => {
    if (!selectedEvidence) return;
    Alert.alert(t('btn_loeschen'), t('measure_delete_confirm' as any), [
      { text: t('btn_abbrechen'), style: "cancel" },
      {
        text: t('btn_loeschen'),
        style: "destructive",
        onPress: async () => {
          const next = (selectedEvidence.measurements || []).filter((x) => x.id !== id);
          const updated = await updateEvidence(selectedEvidence.id, { measurements: next });
          if (updated) {
            setSelectedEvidence(updated);
            setEvidence((cur) => cur.map((e) => (e.id === updated.id ? updated : e)));
          }
        },
      },
    ]);
  };

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
        defectId: selectedDefectId || undefined,
        measurements: [...(selectedEvidence.measurements || []), measurement],
      } as any);
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
      setStep(1);
    } catch (error) {
      Alert.alert(
        t('measure_alert_save_failed_title' as any),
        error instanceof Error ? error.message : t('measure_alert_save_failed_msg' as any),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExportPdf() {
    if (!selectedEvidence) return;
    if (!startPoint || !endPoint) {
      Alert.alert(t('measure_alert_messstrecke_title' as any), t('measure_alert_messstrecke_msg' as any));
      return;
    }
    setIsExporting(true);
    try {
      await ensureMeasurementDirectory();
      const imageUri = await captureRef(canvasRef, { format: "png", quality: 1, result: "tmpfile" });

      const accuracyText =
        selectedMethod.accuracy === "estimated"
          ? t('measure_quality_estimate' as any)
          : `${selectedMethod.accuracy === "verified" ? t('measure_quality_verified' as any) : t('measure_quality_calibrated' as any)}`;
      const toleranceUnit = unit === "m²" || unit === "ft²" || unit === "yd²" || unit === "Stk." ? "%" : unit;

      const rows = [
        { label: t('measure_field_value' as any), value: value.trim() ? `${value.replace(".", ",")} ${unit}` : "" },
        { label: t('measure_field_method' as any), value: t(selectedMethod.label as any) },
        { label: t('measure_pdf_quality' as any), value: accuracyText },
        { label: t('measure_field_tolerance' as any), value: tolerance.trim() ? `${tolerance.replace(".", ",")} ${toleranceUnit}` : "" },
        { label: t('measure_pdf_date' as any), value: new Date().toLocaleDateString(DATE_LOCALE[language] || "de-DE", { day: "2-digit", month: "long", year: "numeric" }) },
      ];

      const result = await exportMeasurementPdf({
        imageUri,
        title: t('measure_title' as any),
        heading: project?.name || "",
        findingLabel: t('measure_finding_label' as any),
        findingText,
        rows,
        noteLabel: t('measure_field_note' as any),
        note,
        dialogTitle: t('measure_title' as any),
      });
      if (result === "unavailable") {
        Alert.alert(t('measure_alert_messstrecke_title' as any), t('floor_plan_export_unavailable' as any));
      } else if (result === "empty") {
        Alert.alert(t('measure_alert_save_failed_title' as any), t('floor_plan_export_error' as any));
      }
    } catch (error) {
      Alert.alert(
        t('measure_alert_save_failed_title' as any),
        error instanceof Error ? error.message : t('floor_plan_export_error' as any),
      );
    } finally {
      setIsExporting(false);
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
        {selectedEvidence && step >= 2 ? (
          <Pressable
            onPress={() => void handleExportPdf()}
            disabled={isExporting}
            accessibilityLabel={t('measure_export_pdf' as any)}
            style={({ pressed }) => [{ padding: 4, opacity: pressed || isExporting ? 0.6 : 1 }]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color="#00ACC1" />
            ) : (
              <MaterialIcons name="ios-share" size={24} color="#00ACC1" />
            )}
          </Pressable>
        ) : (
          <MaterialIcons name="straighten" size={26} color="#00ACC1" />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!project ? (
          <View style={[styles.notice, { borderColor: colors.warning }]}>
            <Text style={[styles.noticeTitle, { color: colors.foreground }]}>{t('measure_no_project_title' as any)}</Text>
            <Text style={[styles.noticeText, { color: colors.muted }]}>{t('measure_no_project_text' as any)}</Text>
          </View>
        ) : (
          <>
            <View style={styles.stepBar}>
              {STEP_DEFS.map((s) => {
                const active = step === s.n;
                const done = step > s.n;
                return (
                  <View key={s.n} style={styles.stepItem}>
                    <View style={[styles.stepDot, { backgroundColor: active || done ? "#00ACC1" : colors.surface, borderColor: active || done ? "#00ACC1" : colors.border }]}>
                      {done ? <MaterialIcons name="check" size={13} color="#FFFFFF" /> : <Text style={{ color: active ? "#FFFFFF" : colors.muted, fontWeight: "800", fontSize: 11 }}>{s.n}</Text>}
                    </View>
                    <Text style={[styles.stepLabel, { color: active ? colors.foreground : colors.muted }]} numberOfLines={1}>{t(s.labelKey as any)}</Text>
                  </View>
                );
              })}
            </View>

            {step === 1 && (
            <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('measure_step_evidence' as any)}</Text>
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
                <View style={styles.canvas}>
                  <Image
                    source={{ uri: selectedEvidence.previewUri || selectedEvidence.originalUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    onLoad={(e: any) => { const s = e?.source; if (s?.width && s?.height) setImageSize({ width: s.width, height: s.height }); }}
                  />
                  <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
                    {savedMeasurementLines()}
                  </Svg>
                </View>

                {measurementsList.length > 0 && (
                  <View style={[styles.measTable, { borderColor: colors.border }]}>
                    <View style={styles.measHeadRow}>
                      <Text style={[styles.measHeadCell, styles.measColTag, { color: colors.muted }]}>{t('measure_step_measure' as any)}</Text>
                      <Text style={[styles.measHeadCell, styles.measColVal, { color: colors.muted }]}>{t('measure_col_value' as any)}</Text>
                      <Text style={[styles.measHeadCell, styles.measColMethod, { color: colors.muted }]}>{t('measure_col_method' as any)}</Text>
                      <View style={styles.measColDel} />
                    </View>
                    {measurementsList.map((m, i) => (
                      <View key={m.id} style={[styles.measDataRow, { borderTopColor: colors.border }]}>
                        <Text style={[styles.measTag, styles.measColTag]}>{`M${i + 1}`}</Text>
                        <Text style={[styles.measCell, styles.measColVal, { color: colors.foreground }]}>{fmtMeasureValue(m)}</Text>
                        <Text style={[styles.measCell, styles.measColMethod, { color: colors.muted }]} numberOfLines={1}>{methodShortLabel(m.method)}</Text>
                        <Pressable onPress={() => deleteMeasurement(m.id)} hitSlop={6} style={styles.measColDel}>
                          <MaterialIcons name="delete-outline" size={18} color="#DC2626" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            <View style={styles.navRow}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={() => selectedEvidence && setStep(2)}
                disabled={!selectedEvidence}
                style={({ pressed }) => [styles.navNext, { opacity: !selectedEvidence ? 0.4 : pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.navNextText}>{t('btn_weiter')}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
            </>
            )}

            {/* STEP 2 – Messung */}
            {step === 2 && selectedEvidence && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('measure_section_draw_line' as any)}</Text>
                <Text style={[styles.helpText, { color: colors.muted }]}>{t('measure_help_text' as any)}</Text>
                <GestureDetector gesture={drawingGesture}>
                  <View ref={canvasRef} collapsable={false} style={styles.canvas}>
                    <Image
                      source={{ uri: selectedEvidence.previewUri || selectedEvidence.originalUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="contain"
                      onLoad={(e: any) => { const s = e?.source; if (s?.width && s?.height) setImageSize({ width: s.width, height: s.height }); }}
                    />
                    <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
                      {savedMeasurementLines()}
                      {startPoint && endPoint && (
                        <>
                          <Line x1={startPoint.x} y1={startPoint.y} x2={endPoint.x} y2={endPoint.y} stroke="#FF3B30" strokeWidth={4} />
                          <Circle cx={startPoint.x} cy={startPoint.y} r={20} fill="rgba(255,59,48,0.18)" />
                          <Circle cx={endPoint.x} cy={endPoint.y} r={20} fill="rgba(255,59,48,0.18)" />
                          <Circle cx={startPoint.x} cy={startPoint.y} r={9} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                          <Circle cx={endPoint.x} cy={endPoint.y} r={9} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                          <Rect x={Math.max(4, (startPoint.x + endPoint.x) / 2 - 58)} y={Math.max(4, (startPoint.y + endPoint.y) / 2 - 30)} width={116} height={25} rx={4} fill="rgba(0,0,0,0.72)" />
                          <SvgText x={(startPoint.x + endPoint.x) / 2} y={Math.max(21, (startPoint.y + endPoint.y) / 2 - 13)} fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle">{measurementLabel}</SvgText>
                        </>
                      )}
                    </Svg>
                  </View>
                </GestureDetector>

                <View style={styles.valueRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_value' as any)}</Text>
                    <TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0,00" placeholderTextColor={colors.muted} style={[styles.input, styles.valueInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
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
                <View style={styles.methodChips}>
                  {METHODS.map((item) => {
                    const active = method === item.value;
                    return (
                      <Pressable key={item.value} onPress={() => setMethod(item.value)} style={[styles.methodChip, { borderColor: active ? "#00ACC1" : colors.border, backgroundColor: active ? "#00ACC118" : colors.surface }]}>
                        <Text style={{ color: active ? "#00ACC1" : colors.foreground, fontWeight: active ? "800" : "600", fontSize: 13 }}>{t(item.label as any)}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(1)} style={({ pressed }) => [styles.navBack, { opacity: pressed ? 0.7 : 1, borderColor: colors.border }]}>
                    <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
                    <Text style={[styles.navBackText, { color: colors.foreground }]}>{t('btn_zurueck')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStep(3)}
                    disabled={!(startPoint && endPoint) || !value.trim()}
                    style={({ pressed }) => [styles.navNext, { flex: 1, opacity: (!(startPoint && endPoint) || !value.trim()) ? 0.4 : pressed ? 0.85 : 1 }]}
                  >
                    <Text style={styles.navNextText}>{t('btn_weiter')}</Text>
                    <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
                  </Pressable>
                </View>
              </>
            )}

            {/* STEP 3 – Dokumentation */}
            {step === 3 && selectedEvidence && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('measure_step_document' as any)}</Text>

                <View ref={canvasRef} collapsable={false} style={styles.canvas}>
                  <Image source={{ uri: selectedEvidence.previewUri || selectedEvidence.originalUri }} style={StyleSheet.absoluteFill} contentFit="contain" />
                  <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={StyleSheet.absoluteFill}>
                    {savedMeasurementLines(true)}
                    {startPoint && endPoint && (
                      <>
                        <Line x1={startPoint.x} y1={startPoint.y} x2={endPoint.x} y2={endPoint.y} stroke="#FF3B30" strokeWidth={4} />
                        <Circle cx={startPoint.x} cy={startPoint.y} r={7} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                        <Circle cx={endPoint.x} cy={endPoint.y} r={7} fill="#FFFFFF" stroke="#FF3B30" strokeWidth={3} />
                        <Rect x={Math.max(4, (startPoint.x + endPoint.x) / 2 - 58)} y={Math.max(4, (startPoint.y + endPoint.y) / 2 - 30)} width={116} height={25} rx={4} fill="rgba(0,0,0,0.72)" />
                        <SvgText x={(startPoint.x + endPoint.x) / 2} y={Math.max(21, (startPoint.y + endPoint.y) / 2 - 13)} fill="#FFFFFF" fontSize={12} fontWeight="700" textAnchor="middle">{measurementLabel}</SvgText>
                      </>
                    )}
                  </Svg>
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_finding_label' as any)}</Text>
                <TextInput value={findingText} onChangeText={setFindingText} placeholder={t('measure_finding_placeholder' as any)} placeholderTextColor={colors.muted} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_tolerance' as any)}</Text>
                <TextInput value={tolerance} onChangeText={setTolerance} keyboardType="decimal-pad" placeholder={t('measure_tolerance_placeholder' as any)} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_field_note' as any)}</Text>
                <TextInput value={note} onChangeText={setNote} placeholder={t('measure_note_placeholder' as any)} placeholderTextColor={colors.muted} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t('measure_assign_label' as any)}</Text>
                <Pressable onPress={() => setShowDefectPicker(true)} style={({ pressed }) => [styles.methodDropdown, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}>
                  <MaterialIcons name="link" size={18} color={selectedDefectId ? "#00ACC1" : colors.muted} />
                  <Text style={{ flex: 1, color: selectedDefectId ? colors.foreground : colors.muted, fontWeight: "600" }} numberOfLines={1}>
                    {selectedDefectId ? (defects.find((d) => d.id === selectedDefectId)?.title || t('measure_assign_label' as any)) : t('measure_assign_none' as any)}
                  </Text>
                  {selectedDefectId ? (
                    <Pressable onPress={() => setSelectedDefectId(null)} hitSlop={8}><MaterialIcons name="close" size={18} color={colors.muted} /></Pressable>
                  ) : (
                    <MaterialIcons name="expand-more" size={22} color={colors.muted} />
                  )}
                </Pressable>

                <View style={[styles.qualityBanner, { borderColor: selectedMethod.accuracy === "estimated" ? colors.warning : "#00ACC1" }]}>
                  <MaterialIcons name={selectedMethod.accuracy === "estimated" ? "warning-amber" : "verified"} size={22} color={selectedMethod.accuracy === "estimated" ? colors.warning : "#00ACC1"} />
                  <Text style={[styles.qualityText, { color: colors.foreground }]}>
                    {selectedMethod.accuracy === "estimated"
                      ? t('measure_quality_estimate' as any)
                      : `${t('measure_quality_prefix' as any)}${selectedMethod.accuracy === "verified" ? t('measure_quality_verified' as any) : t('measure_quality_calibrated' as any)}${t('measure_quality_suffix' as any)}`}
                  </Text>
                </View>

                <View style={styles.navRow}>
                  <Pressable onPress={() => setStep(2)} style={({ pressed }) => [styles.navBack, { opacity: pressed ? 0.7 : 1, borderColor: colors.border }]}>
                    <MaterialIcons name="arrow-back" size={20} color={colors.foreground} />
                    <Text style={[styles.navBackText, { color: colors.foreground }]}>{t('btn_zurueck')}</Text>
                  </Pressable>
                  <Pressable onPress={() => void saveMeasurement()} disabled={isSaving} style={({ pressed }) => [styles.saveButton, { flex: 1, marginTop: 0, opacity: isSaving ? 0.5 : pressed ? 0.8 : 1 }]}>
                    <MaterialIcons name="save" size={22} color="#FFFFFF" />
                    <Text style={styles.saveButtonText}>{isSaving ? t('measure_saving' as any) : t('measure_save_record' as any)}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Zuordnung zu Mangel / Aufgabe */}
      <Modal visible={showDefectPicker} transparent animationType="fade" onRequestClose={() => setShowDefectPicker(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setShowDefectPicker(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.background, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>{t('measure_assign_label' as any)}</Text>
            <ScrollView>
              <Pressable
                onPress={() => { setSelectedDefectId(null); setShowDefectPicker(false); }}
                style={({ pressed }) => [styles.pickerRow, { borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ flex: 1, color: colors.muted, fontWeight: "600" }}>{t('measure_assign_none' as any)}</Text>
                {!selectedDefectId && <MaterialIcons name="check" size={20} color="#00ACC1" />}
              </Pressable>
              {defects.map((d) => {
                const active = selectedDefectId === d.id;
                const sub = [d.floor, d.room].filter(Boolean).join(" · ") || d.location || "";
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => { setSelectedDefectId(d.id); setShowDefectPicker(false); }}
                    style={({ pressed }) => [styles.pickerRow, { borderColor: active ? "#00ACC1" : colors.border, backgroundColor: active ? "#00ACC118" : colors.surface, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.methodLabel, { color: active ? "#00ACC1" : colors.foreground }]} numberOfLines={1}>{d.title}</Text>
                      {sub ? <Text style={[styles.methodDescription, { color: colors.muted }]} numberOfLines={1}>{sub}</Text> : null}
                    </View>
                    {active && <MaterialIcons name="check" size={20} color="#00ACC1" />}
                  </Pressable>
                );
              })}
              {defects.length === 0 && (
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 20 }}>{t('measure_no_project_text' as any)}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  methodDropdown: { borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  methodLabel: { fontSize: 14, fontWeight: "800" },
  methodDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  pickerSheet: { borderWidth: 1, borderRadius: 14, padding: 16, maxHeight: "80%" },
  pickerTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  pickerRow: { borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  qualityBanner: { marginTop: 16, borderWidth: 1, padding: 12, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  qualityText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saveButton: { marginTop: 18, minHeight: 54, backgroundColor: "#00ACC1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  stepBar: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  stepItem: { flex: 1, alignItems: "center", gap: 5 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  stepLabel: { fontSize: 11, fontWeight: "700" },
  valueInput: { fontSize: 22, fontWeight: "800" },
  measTable: { marginTop: 12, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  measHeadRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 },
  measHeadCell: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  measDataRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  measTag: { fontSize: 13, fontWeight: "800", color: "#00ACC1" },
  measCell: { fontSize: 13 },
  measColTag: { width: 46 },
  measColVal: { flex: 1 },
  measColMethod: { flex: 1.3 },
  measColDel: { width: 30, alignItems: "flex-end" },
  methodChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  navRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
  navNext: { minHeight: 50, borderRadius: 10, backgroundColor: "#00ACC1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 22 },
  navNextText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  navBack: { minHeight: 50, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16 },
  navBackText: { fontSize: 15, fontWeight: "700" },
});
