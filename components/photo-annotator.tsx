import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Modal,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
} from "react-native-reanimated";
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { createLocalId } from "@/lib/id";
import { useTranslation } from "@/lib/language-provider";

const SCREEN_WIDTH = Dimensions.get("window").width;

type AnnotationType = "arrow" | "circle" | "rect" | "freehand" | "text";
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
  { type: "rect", icon: "crop-square", label: "photo_annotator_tool_rect" },
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
    if (!isDrawing || currentPath.length < 2) {
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
  }, [isDrawing, currentPath, currentTool, currentColor]);

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
    const { type, color, points, id } = annotation;
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

  const panGesture = Gesture.Pan()
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

        {/* Canvas */}
        <View style={styles.canvasContainer}>
          <View ref={canvasRef} collapsable={false} style={{ width: imageSize.width, height: imageSize.height }}>
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
            <GestureDetector gesture={panGesture}>
              <Animated.View style={[StyleSheet.absoluteFill, { width: imageSize.width, height: imageSize.height }]}>
                <Svg width={imageSize.width} height={imageSize.height} style={StyleSheet.absoluteFill}>
                  {annotations.map(renderAnnotation)}
                  {renderCurrentPath()}
                </Svg>
              </Animated.View>
            </GestureDetector>
          </View>
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
