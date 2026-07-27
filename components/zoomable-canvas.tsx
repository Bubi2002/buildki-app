import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  clampTranslation,
  clampZoomScale,
  screenPointToNormalized,
  type Point,
} from "@/lib/zoom-transform";

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

  const setInteraction = (active: boolean) => {
    onInteractionChange?.(active);
  };

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
      if (onInteractionChange) runOnJS(setInteraction)(true);
    })
    .onUpdate((event) => {
      const nextScale = clampZoomScale(savedScale.value * event.scale, 1, maxScale);
      scale.value = nextScale;
      translateX.value = clampTranslation(translateX.value, width, nextScale);
      translateY.value = clampTranslation(translateY.value, height, nextScale);
    })
    .onFinalize(() => {
      const nextScale = clampZoomScale(scale.value, 1, maxScale);
      scale.value = withTiming(nextScale, { duration: 140 });
      translateX.value = withTiming(clampTranslation(translateX.value, width, nextScale), { duration: 140 });
      translateY.value = withTiming(clampTranslation(translateY.value, height, nextScale), { duration: 140 });
      if (onInteractionChange) runOnJS(setInteraction)(false);
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      if (onInteractionChange) runOnJS(setInteraction)(true);
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      translateX.value = clampTranslation(savedTranslateX.value + event.translationX, width, scale.value);
      translateY.value = clampTranslation(savedTranslateY.value + event.translationY, height, scale.value);
    })
    .onFinalize(() => {
      translateX.value = withTiming(clampTranslation(translateX.value, width, scale.value), { duration: 140 });
      translateY.value = withTiming(clampTranslation(translateY.value, height, scale.value), { duration: 140 });
      if (onInteractionChange) runOnJS(setInteraction)(false);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((event) => {
      const nextScale = scale.value > 1.05 ? 1 : Math.min(2.25, maxScale);
      const nextX = nextScale === 1
        ? 0
        : clampTranslation((width / 2 - event.x) * (nextScale - 1), width, nextScale);
      const nextY = nextScale === 1
        ? 0
        : clampTranslation((height / 2 - event.y) * (nextScale - 1), height, nextScale);
      scale.value = withTiming(nextScale, { duration: 220 });
      translateX.value = withTiming(nextX, { duration: 220 });
      translateY.value = withTiming(nextY, { duration: 220 });
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(8)
    .onEnd((event) => {
      if (!onSingleTap) return;
      const point = screenPointToNormalized(
        { x: event.x, y: event.y },
        { width, height },
        scale.value,
        { x: translateX.value, y: translateY.value },
      );
      runOnJS(onSingleTap)(point);
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
