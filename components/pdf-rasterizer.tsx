/**
 * PdfRasterizer – converts the first page of a PDF into a sharp raster image
 * using only expo-image (which can render PDF pages) + react-native-view-shot.
 *
 * No native PDF module required. While a `pdfUri` is set it shows a small
 * "converting" overlay, renders the page off-screen at high resolution, and
 * captures it to a JPG, returning the file URI via `onDone`.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, PixelRatio, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { captureRef } from "react-native-view-shot";

export type RasterResult = { uri: string; width: number; height: number };

type Props = {
  /** When set, conversion runs. Set back to null when done. */
  pdfUri: string | null;
  label?: string;
  /** Target longest edge of the produced raster, in output PIXELS. */
  maxSize?: number;
  onDone: (result: RasterResult | null) => void;
};

// Keep the captured bitmap within the GPU texture limit of older iPads/phones.
const MAX_EDGE_PX = 8000;

export function PdfRasterizer({ pdfUri, label, maxSize = 1600, onDone }: Props) {
  const stageRef = useRef<View>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const finished = useRef(false);

  useEffect(() => {
    finished.current = false;
    setDims(null);
    if (!pdfUri) return;
    // Safety net: never hang the UI if the PDF cannot be read.
    const timeout = setTimeout(() => finish(null), 30000);
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
            // maxSize is the desired OUTPUT long edge in pixels. expo-image
            // rasterizes the PDF at the stage's point-size × screen scale, and
            // view-shot captures at that same density, so we size the stage in
            // POINTS = targetPx / scale to get a predictable pixel result that
            // does not depend on the device's pixel density.
            const scale = Math.max(1, PixelRatio.get());
            // Long edge = targetPx; cap both edges to the texture limit.
            let longPx = Math.min(maxSize, MAX_EDGE_PX);
            let shortPx = Math.round(longPx * (ratio >= 1 ? 1 / ratio : ratio));
            if (Math.max(longPx, shortPx) > MAX_EDGE_PX) {
              const k = MAX_EDGE_PX / Math.max(longPx, shortPx);
              longPx = Math.round(longPx * k);
              shortPx = Math.round(shortPx * k);
            }
            const wPx = ratio >= 1 ? shortPx : longPx; // portrait → width is short
            const hPx = ratio >= 1 ? longPx : shortPx;
            setDims({ w: Math.max(1, Math.round(wPx / scale)), h: Math.max(1, Math.round(hPx / scale)) });
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
                  // Larger renders need a longer beat to finish rasterizing the
                  // PDF vector content before we snapshot it.
                  await new Promise((resolve) => setTimeout(resolve, 700));
                  // The stage is far larger than the screen, so the default
                  // drawViewHierarchyInRect path (which "doesn't work for large
                  // views" per RNViewShot.mm and yields a blank/blurry frame)
                  // must NOT be used. useRenderInContext renders the layer tree
                  // directly and works for large off-screen views. Combined with
                  // the point-sized stage this captures at (points × screen
                  // scale) px → a sharp, predictable resolution.
                  const uri = await captureRef(stageRef, {
                    format: "jpg",
                    quality: 1,
                    result: "tmpfile",
                    useRenderInContext: true,
                  });
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
