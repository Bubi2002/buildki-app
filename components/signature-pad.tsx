import { useState, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Svg, { Path } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type SignaturePadProps = {
  onSave: (svgPaths: string[]) => void;
  onCancel: () => void;
  initialPaths?: string[];
};

export function SignaturePad({ onSave, onCancel, initialPaths }: SignaturePadProps) {
  const colors = useColors();
  const [paths, setPaths] = useState<string[]>(initialPaths || []);
  const [currentPath, setCurrentPath] = useState<string>("");
  const padWidth = SCREEN_WIDTH - 48;
  const padHeight = 200;

  const panGesture = Gesture.Pan()
    .onStart((e) => {
      setCurrentPath(`M${e.x.toFixed(1)},${e.y.toFixed(1)}`);
    })
    .onUpdate((e) => {
      setCurrentPath((prev) => `${prev} L${e.x.toFixed(1)},${e.y.toFixed(1)}`);
    })
    .onEnd(() => {
      if (currentPath) {
        setPaths((prev) => [...prev, currentPath]);
        setCurrentPath("");
      }
    })
    .runOnJS(true);

  const clear = () => {
    setPaths([]);
    setCurrentPath("");
  };

  const handleSave = () => {
    onSave(paths);
  };

  const hasSignature = paths.length > 0 || currentPath.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Unterschrift
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Bitte hier unterschreiben
      </Text>

      <GestureDetector gesture={panGesture}>
        <View style={[styles.pad, { borderColor: colors.border, backgroundColor: "#FFFFFF" }]}>
          <Svg width={padWidth} height={padHeight}>
            {paths.map((p, i) => (
              <Path
                key={i}
                d={p}
                stroke="#1a1a1a"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath ? (
              <Path
                d={currentPath}
                stroke="#1a1a1a"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>

          {!hasSignature && (
            <View style={styles.placeholder}>
              <Text style={[styles.placeholderText, { color: colors.muted }]}>
                ✍️ Hier unterschreiben
              </Text>
            </View>
          )}

          {/* Signature line */}
          <View style={[styles.signatureLine, { backgroundColor: colors.border }]} />
        </View>
      </GestureDetector>

      <View style={styles.buttonRow}>
        <Pressable
          onPress={clear}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.foreground }]}>Löschen</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: colors.muted }]}>Abbrechen</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={!hasSignature}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: hasSignature ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.btnText, { color: "#FFF" }]}>Speichern</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Convert SVG paths to an SVG string for embedding in HTML/PDF
 */
export function pathsToSvgString(paths: string[], width: number, height: number): string {
  const pathElements = paths
    .map((d) => `<path d="${d}" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${pathElements}
  </svg>`;
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  pad: {
    width: "100%",
    height: 200,
    borderWidth: 1.5,
    borderRadius: 12,
    borderStyle: "dashed",
    overflow: "hidden",
    position: "relative",
  },
  placeholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  placeholderText: {
    fontSize: 16,
  },
  signatureLine: {
    position: "absolute",
    bottom: 40,
    left: 24,
    right: 24,
    height: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
