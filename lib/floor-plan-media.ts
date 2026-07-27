import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

import { fitWithinBounds } from "@/lib/zoom-transform";

export type FloorPlanMediaKind = "plan" | "photo";

export type PersistFloorPlanMediaInput = {
  sourceUri: string;
  projectId: string;
  ownerId: string;
  width?: number;
  height?: number;
  kind: FloorPlanMediaKind;
};

export type PersistedFloorPlanMedia = {
  uri: string;
  width: number;
  height: number;
};

const MEDIA_DIRECTORY = "floor-plan-media-v1";

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "media";
}

export async function persistFloorPlanMedia(
  input: PersistFloorPlanMediaInput,
): Promise<PersistedFloorPlanMedia> {
  const sourceWidth = Math.max(1, input.width || 1);
  const sourceHeight = Math.max(1, input.height || 1);
  const maximum = input.kind === "plan" ? 3072 : 2048;
  const target = fitWithinBounds(sourceWidth, sourceHeight, maximum, maximum);

  try {
    const actions = input.width && input.height && (target.width < sourceWidth || target.height < sourceHeight)
      ? [{ resize: target }]
      : [];
    const processed = await ImageManipulator.manipulateAsync(
      input.sourceUri,
      actions,
      {
        compress: input.kind === "plan" ? 0.9 : 0.82,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    if (Platform.OS === "web" || !FileSystem.documentDirectory) {
      return { uri: processed.uri, width: processed.width, height: processed.height };
    }

    const directory = `${FileSystem.documentDirectory}${MEDIA_DIRECTORY}/${safeSegment(input.projectId)}/`;
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const destination = `${directory}${safeSegment(input.ownerId)}-${input.kind}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: processed.uri, to: destination });
    return { uri: destination, width: processed.width, height: processed.height };
  } catch {
    return { uri: input.sourceUri, width: sourceWidth, height: sourceHeight };
  }
}
