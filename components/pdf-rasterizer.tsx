/**
 * PdfRasterizer – converts the first page of a PDF into a sharp raster image
 * using only expo-image (which can render PDF pages) + react-native-view-shot.
 *
 * No native PDF module required. While a `pdfUri` is set it shows a small
 * "converting" overlay, renders the page off-screen at high resolution, and
 * captures it to a JPG, returning the file URI via `onDone`.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";

export type RasterResult = { uri: string; width: number; height: number };

type Props = {
  /** When set, conversion runs. Set back to null when done. */
  pdfUri: string | null;
  label?: string;
  /** Longest edge of the produced raster (px). */
  maxSize?: number;
  onDone: (result: RasterResult | null) => void;
};

export function PdfRasterizer({ pdfUri, label, maxSize = 1600, onDone }: Props) {
  const stageRef = useRef<View>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    finished.current = false;
    setDims(null);
    if (!pdfUri) return;
    // Safety net: never hang the UI if the PDF cannot be read.
    const timeout = setTimeout(() => finish(null), 20000);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUri]);

  const finish = (result: RasterResult | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(result);
  };

  if (!pdfUri) return null;

  return (
    <Modal visible transparent animationType="fade">
      {/* Off-screen probe to read the PDF page aspect ratio. */}
      {!dims && (
        <Image
          source={{ uri: pdfUri }}
          style={styles.probe}
          contentFit="contain"
          onLoad={(e: any) => {
            const s = e?.source;
            const ratio = s?.width > 0 && s?.height > 0 ? s.height / s.width : 0.7071; // A-series fallback
            setDims({ w: maxSize, h: Math.max(1, Math.round(maxSize * ratio)) });
          }}
          onError={() => finish(null)}
        />
      )}

      {/* Full-resolution render that gets captured to a JPG. */}
      {dims && (
        <View style={styles.stage} pointerEvents="none">
          <View ref={stageRef} collapsable={false} style={{ width: dims.w, height: dims.h, backgroundColor: "#FFFFFF" }}>
            <Image
              source={{ uri: pdfUri }}
              style={{ width: dims.w, height: dims.h }}
              contentFit="fill"
              cachePolicy="none"
              allowDownscaling={false}
              onLoad={async () => {
                try {
                  // Wait for two frames + a beat so expo-image has fully
                  // rasterized the PDF page before we snapshot it — capturing
                  // too early yields a blurry/half-rendered frame.
                  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))));
                  await new Promise((resolve) => setTimeout(resolve, 450));
                  // No explicit width/height → view-shot captures at the device
                  // pixel density (≈ view size × screen scale), so the result is
                  // sharper than a 1:1 point-size capture.
                  const uri = await captureRef(stageRef, { format: "jpg", quality: 0.95, result: "tmpfile" });
                  finish({ uri, width: dims.w, height: dims.h });
                } catch {
                  finish(null);
                }
              }}
              onError={() => finish(null)}
            />
          </View>
        </View>
      )}

      {/* Visible overlay (rendered last → on top, hides the stage). */}
      <View style={styles.overlay}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.9)" },
  label: { color: "#FFFFFF", marginTop: 14, fontSize: 15, fontWeight: "600" },
  probe: { position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0 },
  stage: { position: "absolute", left: 0, top: 0, opacity: 1 },
});
