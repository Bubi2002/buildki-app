import { View } from "react-native";
import { Image } from "expo-image";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { FloorPlan, PlanPin } from "@/lib/floor-plan-store";

const PIN_COLORS: Record<string, string> = {
  photo: "#2196F3",
  defect: "#F44336",
  note: "#FF9800",
  protocol: "#4CAF50",
  chapter: "#9C27B0",
  task: "#818CF8",
};
const PIN_ICONS: Record<string, string> = {
  photo: "photo-camera",
  defect: "report-problem",
  note: "edit-note",
  protocol: "description",
  chapter: "bookmark",
  task: "task-alt",
};

/**
 * Static, non-interactive preview of a floor plan with its pins overlaid.
 * Pins are stored image-normalized (0..1) and mapped onto the actually
 * displayed image rectangle (contentFit="contain" letterbox), matching the
 * floor-plan editor so markers sit exactly where they were placed.
 */
export function PlanWithPins({
  plan,
  pins,
  width,
  maxHeight = 520,
}: {
  plan: FloorPlan;
  pins: PlanPin[];
  width: number;
  maxHeight?: number;
}) {
  const ar = Math.max(0.1, (plan.width || 1) / (plan.height || 1));
  const h = Math.min(width / ar, maxHeight);
  const contAspect = width / h;
  const dispW = ar > contAspect ? width : h * ar;
  const dispH = ar > contAspect ? width / ar : h;
  const offX = (width - dispW) / 2;
  const offY = (h - dispH) / 2;

  return (
    <View style={{ width, height: h, backgroundColor: "#FFFFFF", borderRadius: 8, overflow: "hidden" }}>
      <Image
        source={{ uri: plan.imageUri }}
        style={{ width, height: h }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      {pins.map((p) => (
        <View
          key={p.id}
          style={{
            position: "absolute",
            left: offX + p.x * dispW - 9,
            top: offY + p.y * dispH - 22,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: p.color || PIN_COLORS[p.type] || "#F44336",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: "#FFFFFF",
            }}
          >
            <MaterialIcons name={(PIN_ICONS[p.type] || "place") as any} size={11} color="#FFFFFF" />
          </View>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: 4,
              borderRightWidth: 4,
              borderTopWidth: 6,
              borderLeftColor: "transparent",
              borderRightColor: "transparent",
              borderTopColor: p.color || PIN_COLORS[p.type] || "#F44336",
              marginTop: -1,
            }}
          />
        </View>
      ))}
    </View>
  );
}
