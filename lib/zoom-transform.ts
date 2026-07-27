export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export function clamp(value: number, minimum: number, maximum: number): number {
  "worklet";
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampZoomScale(scale: number, minimum = 1, maximum = 4): number {
  "worklet";
  return clamp(scale, minimum, maximum);
}

export function getTranslationLimit(dimension: number, scale: number): number {
  "worklet";
  return Math.max(0, (dimension * (scale - 1)) / 2);
}

export function clampTranslation(translation: number, dimension: number, scale: number): number {
  "worklet";
  const limit = getTranslationLimit(dimension, scale);
  return clamp(translation, -limit, limit);
}

export function fitWithinBounds(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): Size {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);
  const ratio = Math.min(maxWidth / safeWidth, maxHeight / safeHeight, 1);
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
}

export function screenPointToNormalized(
  point: Point,
  stage: Size,
  scale: number,
  translation: Point,
): Point {
  const safeScale = Math.max(1, scale);
  const localX = (point.x - stage.width / 2 - translation.x) / safeScale + stage.width / 2;
  const localY = (point.y - stage.height / 2 - translation.y) / safeScale + stage.height / 2;
  return {
    x: clamp(localX / stage.width, 0, 1),
    y: clamp(localY / stage.height, 0, 1),
  };
}
