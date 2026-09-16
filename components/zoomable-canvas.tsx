import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { screenPointToNormalized, type Point } from "@/lib/zoom-transform";

// ─── Self-contained worklet math ─────────────────────────────────────────────
// Everything the gesture callbacks touch on the UI thread is defined here as a
// local worklet. Calling a NON-worklet function from a gesture worklet crashes
// the app on Reanimated 4 (react-native-worklets), so we never do that: the tap
// gesture only reads numbers and hands them to the JS thread via runOnJS.
function wClamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

function wClampScale(scale: number, min: number, max: number): number {
  "worklet";
  return wClamp(scale, min, max);
}

function wClampTranslation(translation: number, dimension: number, scale: number): number {
  "worklet";
  const limit = Math.max(0, (dimension * (scale - 1)) / 2);
  return wClamp(translation, -limit, limit);
}

type ZoomableCanvasProps = {
  width: number;
  height: number;
  children: ReactNode;
  maxScale?: number;
  onSingleTap?: (point: Point) => void;
  onInteractionChange?: (active: boolean) => void;
  testID?: string;
};

export function ZoomableCanvas({
  width,
  height,
  children,
  maxScale = 4,
  onSingleTap,
  onInteractionChange,
  testID,
}: ZoomableCanvasProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Plain JS-thread callbacks (safe to call anything). They are invoked from the
  // gesture worklets exclusively through runOnJS with primitive arguments.
  const setInteraction = (active: boolean) => {
    onInteractionChange?.(active);
  };

  const emitTap = (x: number, y: number, scaleValue: number, tx: number, ty: number) => {
    if (!onSingleTap) return;
    const point = screenPointToNormalized({ x, y }, { width, height }, scaleValue, { x: tx, y: ty });
    onSingleTap(point);
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      "worklet";
      savedScale.value = scale.value;
      runOnJS(setInteraction)(true);
    })
    .onUpdate((event) => {
      "worklet";
      const nextScale = wClampScale(savedScale.value * event.scale, 1, maxScale);
      scale.value = nextScale;
      translateX.value = wClampTranslation(translateX.value, width, nextScale);
      translateY.value = wClampTranslation(translateY.value, height, nextScale);
    })
    .onFinalize(() => {
      "worklet";
      const nextScale = wClampScale(scale.value, 1, maxScale);
      scale.value = withTiming(nextScale, { duration: 140 });
      translateX.value = withTiming(wClampTranslation(translateX.value, width, nextScale), { duration: 140 });
      translateY.value = withTiming(wClampTranslation(translateY.value, height, nextScale), { duration: 140 });
      runOnJS(setInteraction)(false);
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onBegin(() => {
      "worklet";
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(setInteraction)(true);
    })
    .onUpdate((event) => {
      "worklet";
      if (scale.value <= 1) return;
      translateX.value = wClampTranslation(savedTranslateX.value + event.translationX, width, scale.value);
      translateY.value = wClampTranslation(savedTranslateY.value + event.translationY, height, scale.value);
    })
    .onFinalize(() => {
      "worklet";
      translateX.value = withTiming(wClampTranslation(translateX.value, width, scale.value), { duration: 140 });
      translateY.value = withTiming(wClampTranslation(translateY.value, height, scale.value), { duration: 140 });
      runOnJS(setInteraction)(false);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((event) => {
      "worklet";
      const nextScale = scale.value > 1.05 ? 1 : Math.min(2.25, maxScale);
      const nextX = nextScale === 1
        ? 0
        : wClampTranslation((width / 2 - event.x) * (nextScale - 1), width, nextScale);
      const nextY = nextScale === 1
        ? 0
        : wClampTranslation((height / 2 - event.y) * (nextScale - 1), height, nextScale);
      scale.value = withTiming(nextScale, { duration: 220 });
      translateX.value = withTiming(nextX, { duration: 220 });
      translateY.value = withTiming(nextY, { duration: 220 });
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(8)
    .onEnd((event) => {
      "worklet";
      // Do NO math in the worklet — hand raw numbers to the JS thread.
      runOnJS(emitTap)(event.x, event.y, scale.value, translateX.value, translateY.value);
    });

  const taps = onSingleTap ? Gesture.Exclusive(doubleTap, singleTap) : doubleTap;
  const gesture = Gesture.Simultaneous(pinch, pan, taps);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width, height, overflow: "hidden" }} testID={testID}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[{ width, height }, animatedStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
