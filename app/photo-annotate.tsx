import { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Path, Line, Polygon, G, Text as SvgText } from "react-native-svg";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system/legacy";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

const COLORS = [
  "#E53935", // Red
  "#FF9800", // Orange
  "#FFEB3B", // Yellow
  "#4CAF50", // Green
  "#2196F3", // Blue
  "#9C27B0", // Purple
  "#FFFFFF", // White
  "#000000", // Black
];

const PEN_SIZES = [3, 5, 8, 12];

type ToolType = "pen" | "arrow" | "text";

type DrawElement = {
  type: "path" | "arrow" | "text";
  color: string;
  strokeWidth: number;
  // For path
  path?: string;
  // For arrow
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  // For text
  x?: number;
  y?: number;
  text?: string;
  fontSize?: number;
};

export default function PhotoAnnotateScreen() {
  const { photoUri, protocolId, photoIndex } = useLocalSearchParams<{
    photoUri: string;
    protocolId: string;
    photoIndex: string;
  }>();
  const colors = useColors();
  const router = useRouter();
  const canvasRef = useRef<View>(null);

  const [elements, setElements] = useState<DrawElement[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [arrowEnd, setArrowEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedSize, setSelectedSize] = useState(PEN_SIZES[1]);
  const [selectedTool, setSelectedTool] = useState<ToolType>("pen");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  // Calculate image dimensions to fit screen
  const imageWidth = SCREEN_WIDTH;
  const imageHeight = SCREEN_HEIGHT - 180;

  // Pan gesture for pen drawing
  const penGesture = Gesture.Pan()
    .enabled(selectedTool === "pen")
    .onStart((e) => {
      setCurrentPath(`M ${e.x} ${e.y}`);
    })
    .onUpdate((e) => {
      setCurrentPath((prev) => `${prev} L ${e.x} ${e.y}`);
    })
    .onEnd(() => {
      if (currentPath) {
        setElements((prev) => [
          ...prev,
          { type: "path", path: currentPath, color: selectedColor, strokeWidth: selectedSize },
        ]);
        setCurrentPath("");
      }
    })
    .runOnJS(true);

  // Pan gesture for arrow drawing
  const arrowGesture = Gesture.Pan()
    .enabled(selectedTool === "arrow")
    .onStart((e) => {
      setArrowStart({ x: e.x, y: e.y });
      setArrowEnd({ x: e.x, y: e.y });
    })
    .onUpdate((e) => {
      setArrowEnd({ x: e.x, y: e.y });
    })
    .onEnd((e) => {
      if (arrowStart) {
        setElements((prev) => [
          ...prev,
          {
            type: "arrow",
            startX: arrowStart.x,
            startY: arrowStart.y,
            endX: e.x,
            endY: e.y,
            color: selectedColor,
            strokeWidth: selectedSize,
          },
        ]);
        setArrowStart(null);
        setArrowEnd(null);
      }
    })
    .runOnJS(true);

  // Tap gesture for text placement
  const tapGesture = Gesture.Tap()
    .enabled(selectedTool === "text")
    .onEnd((e) => {
      setTextPosition({ x: e.x, y: e.y });
      setTextInputValue("");
      setShowTextInput(true);
    })
    .runOnJS(true);

  const composedGesture = Gesture.Race(penGesture, arrowGesture, tapGesture);

  const addTextElement = () => {
    if (textInputValue.trim()) {
      setElements((prev) => [
        ...prev,
        {
          type: "text",
          x: textPosition.x,
          y: textPosition.y,
          text: textInputValue.trim(),
          color: selectedColor,
          strokeWidth: selectedSize,
          fontSize: 16,
        },
      ]);
    }
    setShowTextInput(false);
    setTextInputValue("");
  };

  const undo = () => {
    setElements((prev) => prev.slice(0, -1));
  };

  const clearAll = () => {
    Alert.alert("Alles löschen", "Alle Markierungen entfernen?", [
      { text: "Abbrechen", style: "cancel" },
      { text: "Löschen", onPress: () => setElements([]) },
    ]);
  };

  // Calculate arrowhead points
  const getArrowHead = (x1: number, y1: number, x2: number, y2: number, size: number) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = size * 3 + 6;
    const headAngle = Math.PI / 6;

    const p1x = x2 - headLength * Math.cos(angle - headAngle);
    const p1y = y2 - headLength * Math.sin(angle - headAngle);
    const p2x = x2 - headLength * Math.cos(angle + headAngle);
    const p2y = y2 - headLength * Math.sin(angle + headAngle);

    return `${x2},${y2} ${p1x},${p1y} ${p2x},${p2y}`;
  };

  const saveAnnotation = async () => {
    if (!canvasRef.current || !protocolId) return;

    setIsSaving(true);
    try {
      let annotatedUri: string;

      if (Platform.OS === "web") {
        annotatedUri = photoUri || "";
        const annotationData = { elements, photoUri, protocolId, photoIndex };
        await AsyncStorage.setItem(
          `annotation-${protocolId}-${photoIndex}`,
          JSON.stringify(annotationData)
        );
      } else {
        annotatedUri = await captureRef(canvasRef, {
          format: "png",
          quality: 0.9,
        });

        const annotDir = `${FileSystem.documentDirectory}annotations/`;
        const dirInfo = await FileSystem.getInfoAsync(annotDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(annotDir, { intermediates: true });
        }
        const filename = `annotated_${Date.now()}.png`;
        const destPath = `${annotDir}${filename}`;
        await FileSystem.copyAsync({ from: annotatedUri, to: destPath });
        annotatedUri = destPath;
      }

      // Update the protocol's photos array with the annotated version
      const protocolsData = await AsyncStorage.getItem("protocols");
      if (protocolsData) {
        const protocols = JSON.parse(protocolsData);
        const idx = protocols.findIndex((p: any) => p.id === protocolId);
        if (idx !== -1 && protocols[idx].photos) {
          const photoIdx = parseInt(photoIndex || "0", 10);
          if (photoIdx >= 0 && photoIdx < protocols[idx].photos.length) {
            protocols[idx].photos[photoIdx] = annotatedUri;
            await AsyncStorage.setItem("protocols", JSON.stringify(protocols));
          }
        }
      }

      Alert.alert("Gespeichert", "Die Annotation wurde gespeichert.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error("Save annotation error:", error);
      Alert.alert("Fehler", "Annotation konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  };

  const renderElement = (el: DrawElement, i: number) => {
    switch (el.type) {
      case "path":
        return (
          <Path
            key={i}
            d={el.path || ""}
            stroke={el.color}
            strokeWidth={el.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      case "arrow":
        return (
          <G key={i}>
            <Line
              x1={el.startX}
              y1={el.startY}
              x2={el.endX}
              y2={el.endY}
              stroke={el.color}
              strokeWidth={el.strokeWidth}
              strokeLinecap="round"
            />
            <Polygon
              points={getArrowHead(el.startX!, el.startY!, el.endX!, el.endY!, el.strokeWidth)}
              fill={el.color}
            />
          </G>
        );
      case "text":
        return (
          <G key={i}>
            {/* Text background */}
            <SvgText
              x={el.x}
              y={el.y}
              fontSize={el.fontSize || 16}
              fontWeight="bold"
              fill={el.color === "#000000" ? "#FFFFFF" : "#000000"}
              stroke={el.color === "#000000" ? "#FFFFFF" : "#000000"}
              strokeWidth={3}
              textAnchor="start"
            >
              {el.text}
            </SvgText>
            {/* Text foreground */}
            <SvgText
              x={el.x}
              y={el.y}
              fontSize={el.fontSize || 16}
              fontWeight="bold"
              fill={el.color}
              textAnchor="start"
            >
              {el.text}
            </SvgText>
          </G>
        );
      default:
        return null;
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}
          >
            <MaterialIcons name="close" size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Foto annotieren
          </Text>
          <Pressable
            onPress={saveAnnotation}
            disabled={isSaving || elements.length === 0}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: elements.length > 0 ? colors.primary : colors.border,
                opacity: pressed || isSaving ? 0.7 : 1,
              },
            ]}
          >
            <MaterialIcons name="check" size={20} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>
              {isSaving ? "..." : "Speichern"}
            </Text>
          </Pressable>
        </View>

        {/* Canvas area */}
        <View ref={canvasRef} style={styles.canvasContainer} collapsable={false}>
          <Image
            source={{ uri: photoUri }}
            style={{ width: imageWidth, height: imageHeight }}
            contentFit="contain"
          />
          <GestureDetector gesture={composedGesture}>
            <View style={[styles.svgOverlay, { width: imageWidth, height: imageHeight }]}>
              <Svg width={imageWidth} height={imageHeight}>
                {/* Rendered elements */}
                {elements.map((el, i) => renderElement(el, i))}
                {/* Current drawing path */}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke={selectedColor}
                    strokeWidth={selectedSize}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {/* Current arrow preview */}
                {arrowStart && arrowEnd && selectedTool === "arrow" ? (
                  <G>
                    <Line
                      x1={arrowStart.x}
                      y1={arrowStart.y}
                      x2={arrowEnd.x}
                      y2={arrowEnd.y}
                      stroke={selectedColor}
                      strokeWidth={selectedSize}
                      strokeLinecap="round"
                      strokeDasharray="5,5"
                    />
                    <Polygon
                      points={getArrowHead(arrowStart.x, arrowStart.y, arrowEnd.x, arrowEnd.y, selectedSize)}
                      fill={selectedColor}
                      opacity={0.7}
                    />
                  </G>
                ) : null}
              </Svg>
            </View>
          </GestureDetector>
        </View>

        {/* Tool selector */}
        <View style={[styles.toolSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setSelectedTool("pen")}
            style={[
              styles.toolTab,
              selectedTool === "pen" && { backgroundColor: colors.primary + "20" },
            ]}
          >
            <MaterialIcons name="edit" size={20} color={selectedTool === "pen" ? colors.primary : colors.muted} />
            <Text style={[styles.toolTabText, { color: selectedTool === "pen" ? colors.primary : colors.muted }]}>Stift</Text>
          </Pressable>
          <Pressable
            onPress={() => setSelectedTool("arrow")}
            style={[
              styles.toolTab,
              selectedTool === "arrow" && { backgroundColor: colors.primary + "20" },
            ]}
          >
            <MaterialIcons name="north-east" size={20} color={selectedTool === "arrow" ? colors.primary : colors.muted} />
            <Text style={[styles.toolTabText, { color: selectedTool === "arrow" ? colors.primary : colors.muted }]}>Pfeil</Text>
          </Pressable>
          <Pressable
            onPress={() => setSelectedTool("text")}
            style={[
              styles.toolTab,
              selectedTool === "text" && { backgroundColor: colors.primary + "20" },
            ]}
          >
            <MaterialIcons name="text-fields" size={20} color={selectedTool === "text" ? colors.primary : colors.muted} />
            <Text style={[styles.toolTabText, { color: selectedTool === "text" ? colors.primary : colors.muted }]}>Text</Text>
          </Pressable>
        </View>

        {/* Toolbar */}
        <View style={[styles.toolbar, { backgroundColor: colors.background }]}>
          {/* Color picker toggle */}
          <Pressable
            onPress={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.colorIndicator, { backgroundColor: selectedColor }]} />
          </Pressable>

          {/* Pen size toggle */}
          <Pressable
            onPress={() => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); }}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={[styles.sizeIndicator, { width: selectedSize + 8, height: selectedSize + 8, backgroundColor: colors.foreground }]} />
          </Pressable>

          {/* Undo */}
          <Pressable
            onPress={undo}
            disabled={elements.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed || elements.length === 0 ? 0.4 : 1 },
            ]}
          >
            <MaterialIcons name="undo" size={24} color={colors.foreground} />
          </Pressable>

          {/* Clear all */}
          <Pressable
            onPress={clearAll}
            disabled={elements.length === 0}
            style={({ pressed }) => [
              styles.toolButton,
              { opacity: pressed || elements.length === 0 ? 0.4 : 1 },
            ]}
          >
            <MaterialIcons name="delete-sweep" size={24} color={colors.error} />
          </Pressable>

          {/* Element count */}
          <Text style={[styles.pathCount, { color: colors.muted }]}>
            {elements.length} Element{elements.length !== 1 ? "e" : ""}
          </Text>
        </View>

        {/* Color picker panel */}
        {showColorPicker && (
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, bottom: 120 }]}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Farbe</Text>
            <View style={styles.pickerRow}>
              {COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => { setSelectedColor(color); setShowColorPicker(false); }}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorDotSelected,
                  ]}
                >
                  {selectedColor === color && (
                    <MaterialIcons name="check" size={14} color={color === "#FFFFFF" || color === "#FFEB3B" ? "#000" : "#FFF"} />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Size picker panel */}
        {showSizePicker && (
          <View style={[styles.pickerPanel, { backgroundColor: colors.surface, bottom: 120 }]}>
            <Text style={[styles.pickerLabel, { color: colors.foreground }]}>Stiftstärke</Text>
            <View style={styles.pickerRow}>
              {PEN_SIZES.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => { setSelectedSize(size); setShowSizePicker(false); }}
                  style={[
                    styles.sizeDot,
                    selectedSize === size && { borderColor: colors.primary, borderWidth: 2 },
                  ]}
                >
                  <View
                    style={{
                      width: size + 4,
                      height: size + 4,
                      borderRadius: (size + 4) / 2,
                      backgroundColor: colors.foreground,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Text input modal */}
        <Modal visible={showTextInput} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.textInputModal, { backgroundColor: colors.background }]}>
              <Text style={[styles.textInputTitle, { color: colors.foreground }]}>
                Beschriftung hinzufügen
              </Text>
              <TextInput
                value={textInputValue}
                onChangeText={setTextInputValue}
                placeholder="Text eingeben..."
                placeholderTextColor={colors.muted}
                style={[styles.textInputField, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addTextElement}
                multiline={false}
              />
              <View style={styles.textInputButtons}>
                <Pressable
                  onPress={() => { setShowTextInput(false); setTextInputValue(""); }}
                  style={[styles.textInputBtn, { backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.textInputBtnText, { color: colors.foreground }]}>Abbrechen</Text>
                </Pressable>
                <Pressable
                  onPress={addTextElement}
                  style={[styles.textInputBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.textInputBtnText, { color: "#FFFFFF" }]}>Hinzufügen</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 50 : 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  canvasContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  svgOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  toolSelector: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 0,
  },
  toolTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  toolTabText: { fontSize: 13, fontWeight: "600" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
  toolButton: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  colorIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  sizeIndicator: {
    borderRadius: 20,
  },
  pathCount: { fontSize: 12, marginLeft: "auto" },
  pickerPanel: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  pickerLabel: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
  },
  colorDotSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sizeDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  textInputModal: {
    width: "100%",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  textInputTitle: { fontSize: 18, fontWeight: "700", marginBottom: 16 },
  textInputField: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  textInputButtons: {
    flexDirection: "row",
    gap: 12,
  },
  textInputBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  textInputBtnText: { fontSize: 15, fontWeight: "600" },
});
