import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path, Circle, Rect, Line, Text as SvgText } from "react-native-svg";

// Clamp helpers used on the UI thread by the zoom/pan gestures.
function wClamp(v: number, min: number, max: number) { "worklet"; return Math.min(max, Math.max(min, v)); }
function wClampTrans(t: number, dim: number, s: number) { "worklet"; const limit = Math.max(0, (dim * (s - 1)) / 2); return wClamp(t, -limit, limit); }
import { captureRef } from "react-native-view-shot";
import { createLocalId } from "@/lib/id";
import { useTranslation } from "@/lib/language-provider";

const SCREEN_WIDTH = Dimensions.get("window").width;

type AnnotationType = "arrow" | "circle" | "rect" | "freehand" | "text" | "measure" | "marker";
type AnnotationColor = "#EF4444" | "#F59E0B" | "#22C55E" | "#3B82F6" | "#FFFFFF";

type Annotation = {
  id: string;
  type: AnnotationType;
  color: AnnotationColor;
  points: { x: number; y: number }[];
  text?: string;
};

type Props = {
  visible: boolean;
  photoUri: string;
  onClose: () => void;
  /** Called on save with the vector annotations and, when capture succeeds, a
   *  flattened image file URI (image + drawings baked in). */
  onSave: (annotations: Annotation[], flattenedUri?: string) => void;
  existingAnnotations?: Annotation[];
};

const COLORS: AnnotationColor[] = ["#EF4444", "#F59E0B", "#22C55E", "#3B82F6", "#FFFFFF"];
const TOOLS: { type: AnnotationType; icon: string; label: string }[] = [
  { type: "freehand", icon: "gesture", label: "photo_annotator_tool_freehand" },
  { type: "arrow", icon: "arrow-forward", label: "photo_annotator_tool_arrow" },
  { type: "circle", icon: "radio-button-unchecked", label: "photo_annotator_tool_circle" },
  { type: "marker", icon: "place", label: "photo_annotator_tool_marker" },
  { type: "measure", icon: "straighten", label: "photo_annotator_tool_measure" },
];

export function PhotoAnnotator({ visible, photoUri, onClose, onSave, existingAnnotations = [] }: Props) {
  const { t } = useTranslation();
  const [annotations, setAnnotations] = useState<Annotation[]>(existingAnnotations);
  const [currentTool, setCurrentTool] = useState<AnnotationType>("freehand");
  const [currentColor, setCurrentColor] = useState<AnnotationColor>("#EF4444");
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: SCREEN_WIDTH - 32, height: (SCREEN_WIDTH - 32) * 1.33 });

  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<View>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Zoom/pan of the plan while drawing: two fingers zoom & move, one finger draws.
  const zScale = useSharedValue(1);
  const zSavedScale = useSharedValue(1);
  const zTX = useSharedValue(0);
  const zTY = useSharedValue(0);
  const zSavedTX = useSharedValue(0);
  const zSavedTY = useSharedValue(0);

  const handleTouchStart = useCallback((x: number, y: number) => {
    setStartPoint({ x, y });
    setCurrentPath([{ x, y }]);
    setIsDrawing(true);
  }, []);

  const handleTouchMove = useCallback((x: number, y: number) => {
    if (!isDrawing) return;
    if (currentTool === "freehand") {
      setCurrentPath(prev => [...prev, { x, y }]);
    } else if (startPoint) {
      setCurrentPath([startPoint, { x, y }]);
    }
  }, [isDrawing, currentTool, startPoint]);

  const handleTouchEnd = useCallback(() => {
    // A marker is a single tap (1 point); every other tool needs a drag (2+).
    const minPoints = currentTool === "marker" ? 1 : 2;
    if (!isDrawing || currentPath.length < minPoints) {
      setIsDrawing(false);
      setCurrentPath([]);
      setStartPoint(null);
      return;
    }

    const newAnnotation: Annotation = {
      id: createLocalId("annotation"),
      type: currentTool,
      color: currentColor,
      points: [...currentPath],
    };

    setAnnotations(prev => [...prev, newAnnotation]);
    setCurrentPath([]);
    setStartPoint(null);
    setIsDrawing(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Measure: ask for the real-world length and label the line.
    if (currentTool === "measure") promptMeasure(newAnnotation.id);
  }, [isDrawing, currentPath, currentTool, currentColor]);

  const promptMeasure = (id: string) => {
    const apply = (val?: string) => {
      const v = (val || "").trim();
      setAnnotations(prev => prev.map(a => (a.id === id ? { ...a, text: v } : a)));
    };
    if (Platform.OS === "ios" && (Alert as any).prompt) {
      (Alert as any).prompt(
        t('photo_annotator_measure_title' as any),
        t('photo_annotator_measure_msg' as any),
        apply,
        "plain-text",
        "",
      );
    }
  };

  const undoLast = () => {
    setAnnotations(prev => prev.slice(0, -1));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const clearAll = () => {
    setAnnotations([]);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    // Reset zoom/pan so the captured image shows the FULL plan at native framing
    // (not the zoomed-in section). Annotations are in content space and stay put.
    zScale.value = 1; zTX.value = 0; zTY.value = 0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
    let flattenedUri: string | undefined;
    try {
      if (canvasRef.current) {
        flattenedUri = await captureRef(canvasRef, { format: "jpg", quality: 0.9 });
      }
    } catch {
      // Capture failed → fall back to vector annotations only.
    }
    onSave(annotations, flattenedUri);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSaving(false);
  };

  const renderAnnotation = (annotation: Annotation) => {
    const { type, color, points, id, text } = annotation;
    if (type === "marker") {
      const p = points[0];
      if (!p) return null;
      return (
        <React.Fragment key={id}>
          <Circle cx={p.x} cy={p.y} r={8} fill={color} />
          <Circle cx={p.x} cy={p.y} r={8} fill="none" stroke="#FFFFFF" strokeWidth={2} />
          <Circle cx={p.x} cy={p.y} r={3} fill="#FFFFFF" />
        </React.Fragment>
      );
    }
    if (points.length < 2) return null;

    switch (type) {
      case "freehand": {
        const d = points.reduce((acc, p, i) => {
          return acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`);
        }, "");
        return <Path key={id} d={d} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      }
      case "arrow": {
        const start = points[0];
        const end = points[points.length - 1];
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLen = 15;
        const head1x = end.x - headLen * Math.cos(angle - Math.PI / 6);
        const head1y = end.y - headLen * Math.sin(angle - Math.PI / 6);
        const head2x = end.x - headLen * Math.cos(angle + Math.PI / 6);
        const head2y = end.y - headLen * Math.sin(angle + Math.PI / 6);
        return (
          <React.Fragment key={id}>
            <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={3} />
            <Line x1={end.x} y1={end.y} x2={head1x} y2={head1y} stroke={color} strokeWidth={3} />
            <Line x1={end.x} y1={end.y} x2={head2x} y2={head2y} stroke={color} strokeWidth={3} />
          </React.Fragment>
        );
      }
      case "circle": {
        const start = points[0];
        const end = points[points.length - 1];
        const cx = (start.x + end.x) / 2;
        const cy = (start.y + end.y) / 2;
        const rx = Math.abs(end.x - start.x) / 2;
        const ry = Math.abs(end.y - start.y) / 2;
        const r = Math.max(rx, ry);
        return <Circle key={id} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={3} fill="none" />;
      }
      case "rect": {
        const start = points[0];
        const end = points[points.length - 1];
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        return <Rect key={id} x={x} y={y} width={w} height={h} stroke={color} strokeWidth={3} fill="none" />;
      }
      case "measure": {
        const start = points[0];
        const end = points[points.length - 1];
        const midx = (start.x + end.x) / 2;
        const midy = (start.y + end.y) / 2;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const perp = angle + Math.PI / 2;
        const tick = 6;
        const tdx = tick * Math.cos(perp), tdy = tick * Math.sin(perp);
        const label = text || "";
        const boxW = Math.max(24, label.length * 6.5 + 10);
        return (
          <React.Fragment key={id}>
            <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={2} />
            <Line x1={start.x - tdx} y1={start.y - tdy} x2={start.x + tdx} y2={start.y + tdy} stroke={color} strokeWidth={2} />
            <Line x1={end.x - tdx} y1={end.y - tdy} x2={end.x + tdx} y2={end.y + tdy} stroke={color} strokeWidth={2} />
            {label ? (
              <>
                <Rect x={midx - boxW / 2} y={midy - 20} width={boxW} height={14} rx={3} fill="rgba(0,0,0,0.65)" />
                <SvgText x={midx} y={midy - 10} fill="#FFFFFF" fontSize={9.5} fontWeight="bold" textAnchor="middle">{label}</SvgText>
              </>
            ) : null}
          </React.Fragment>
        );
      }
      default:
        return null;
    }
  };

  const renderCurrentPath = () => {
    if (currentPath.length < 2) return null;
    return renderAnnotation({
      id: "current",
      type: currentTool,
      color: currentColor,
      points: currentPath,
    });
  };

  // A marker is placed with a single TAP. A Pan with minDistance(0) does not
  // reliably fire for a tap-without-movement on iOS (the user had to swipe), so
  // the marker tool uses a dedicated Tap gesture; all drag tools use the Pan.
  const placeMarker = useCallback((x: number, y: number) => {
    const newAnnotation: Annotation = {
      id: createLocalId("annotation"),
      type: "marker",
      color: currentColor,
      points: [{ x, y }],
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [currentColor]);

  const cw = imageSize.width;
  const ch = imageSize.height;

  // One finger draws (maxPointers 1). Its coords are in the transformed view's
  // content space, so drawing lands under the finger even when zoomed/panned.
  const panGesture = Gesture.Pan()
    .enabled(currentTool !== "marker")
    .maxPointers(1)
    .onStart((e) => {
      runOnJS(handleTouchStart)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(handleTouchMove)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(handleTouchEnd)();
    })
    .minDistance(0);

  const tapGesture = Gesture.Tap()
    .enabled(currentTool === "marker")
    .maxDistance(24)
    .onEnd((e) => {
      runOnJS(placeMarker)(e.x, e.y);
    });

  // Two fingers: pinch to zoom, drag to move the plan.
  const pinchGesture = Gesture.Pinch()
    .onBegin(() => { "worklet"; zSavedScale.value = zScale.value; })
    .onUpdate((e) => {
      "worklet";
      const ns = wClamp(zSavedScale.value * e.scale, 1, 5);
      zScale.value = ns;
      zTX.value = wClampTrans(zTX.value, cw, ns);
      zTY.value = wClampTrans(zTY.value, ch, ns);
    })
    .onFinalize(() => {
      "worklet";
      const ns = wClamp(zScale.value, 1, 5);
      zScale.value = withTiming(ns, { duration: 120 });
      zTX.value = withTiming(wClampTrans(zTX.value, cw, ns), { duration: 120 });
      zTY.value = withTiming(wClampTrans(zTY.value, ch, ns), { duration: 120 });
    });

  const twoFingerPan = Gesture.Pan()
    .minPointers(2)
    .onBegin(() => { "worklet"; zSavedTX.value = zTX.value; zSavedTY.value = zTY.value; })
    .onUpdate((e) => {
      "worklet";
      if (zScale.value <= 1) return;
      zTX.value = wClampTrans(zSavedTX.value + e.translationX, cw, zScale.value);
      zTY.value = wClampTrans(zSavedTY.value + e.translationY, ch, zScale.value);
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    twoFingerPan,
    Gesture.Race(tapGesture, panGesture),
  );

  const canvasTransform = useAnimatedStyle(() => ({
    transform: [
      { translateX: zTX.value },
      { translateY: zTY.value },
      { scale: zScale.value },
    ],
  }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={styles.headerButton}>{t('photo_annotator_cancel' as any)}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('photo_annotator_edit_photo' as any)}</Text>
          <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <Text style={[styles.headerButton, { color: "#007AFF" }]}>{t('photo_annotator_done' as any)}</Text>
          </Pressable>
        </View>

        {/* Canvas — two fingers zoom/move the plan, one finger draws. */}
        <View style={styles.canvasContainer}>
          <View ref={canvasRef} collapsable={false} style={{ width: imageSize.width, height: imageSize.height, overflow: "hidden" }}>
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[{ width: imageSize.width, height: imageSize.height }, canvasTransform]}>
                <Image
                  source={{ uri: photoUri }}
                  style={[styles.image, { width: imageSize.width, height: imageSize.height }]}
                  contentFit="contain"
                  onLoad={(e) => {
                    const { width: imgW, height: imgH } = e.source;
                    const containerW = SCREEN_WIDTH - 32;
                    const ratio = imgW / imgH;
                    const containerH = containerW / ratio;
                    setImageSize({ width: containerW, height: Math.min(containerH, 500) });
                  }}
                />
                <Svg width={imageSize.width} height={imageSize.height} style={StyleSheet.absoluteFill}>
                  {annotations.map(renderAnnotation)}
                  {renderCurrentPath()}
                </Svg>
              </Animated.View>
            </GestureDetector>
          </View>
          <Text style={styles.zoomHint}>{t('photo_annotator_zoom_hint' as any)}</Text>
        </View>

        {/* Tools */}
        <View style={styles.toolbar}>
          {/* Tool selection */}
          <View style={styles.toolRow}>
            {TOOLS.map(tool => (
              <Pressable
                key={tool.type}
                onPress={() => setCurrentTool(tool.type)}
                style={[styles.toolButton, currentTool === tool.type && styles.toolButtonActive]}
              >
                <MaterialIcons name={tool.icon as any} size={22} color={currentTool === tool.type ? "#007AFF" : "#666"} />
                <Text style={[styles.toolLabel, currentTool === tool.type && { color: "#007AFF" }]}>{t(tool.label as any)}</Text>
              </Pressable>
            ))}
          </View>

          {/* Color selection */}
          <View style={styles.colorRow}>
            {COLORS.map(color => (
              <Pressable
                key={color}
                onPress={() => setCurrentColor(color)}
                style={[styles.colorDot, { backgroundColor: color, borderColor: currentColor === color ? "#007AFF" : "#333" }, currentColor === color && styles.colorDotActive]}
              />
            ))}
            <View style={{ flex: 1 }} />
            {/* Undo */}
            <Pressable onPress={undoLast} disabled={annotations.length === 0} style={({ pressed }) => [styles.actionBtn, { opacity: annotations.length === 0 ? 0.3 : pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="undo" size={22} color="#FFF" />
            </Pressable>
            {/* Clear */}
            <Pressable onPress={clearAll} disabled={annotations.length === 0} style={({ pressed }) => [styles.actionBtn, { opacity: annotations.length === 0 ? 0.3 : pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="delete-outline" size={22} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 12,
    backgroundColor: "#222",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFF",
  },
  headerButton: {
    fontSize: 16,
    color: "#FFF",
  },
  canvasContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  image: {
    borderRadius: 8,
  },
  zoomHint: {
    color: "#8A8A8E",
    fontSize: 11,
    marginTop: 10,
    textAlign: "center",
  },
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
    paddingTop: 12,
    backgroundColor: "#222",
  },
  toolRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  toolButton: {
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
  },
  toolButtonActive: {
    backgroundColor: "#007AFF20",
  },
  toolLabel: {
    fontSize: 10,
    color: "#999",
    marginTop: 2,
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  colorDotActive: {
    borderWidth: 3,
    transform: [{ scale: 1.15 }],
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#333",
  },
});

export type { Annotation, AnnotationType, AnnotationColor };
