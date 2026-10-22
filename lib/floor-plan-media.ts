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

  // ImagePicker/DocumentPicker/ImageManipulator all return files in the cache
  // or tmp dir, which iOS purges after a few days -> the plan turns white.
  // Everything must end up copied into the persistent Documents dir.
  const persistentDir =
    Platform.OS !== "web" && FileSystem.documentDirectory
      ? `${FileSystem.documentDirectory}${MEDIA_DIRECTORY}/${safeSegment(input.projectId)}/`
      : null;

  const copyIntoPersistent = async (from: string): Promise<string> => {
    if (!persistentDir) return from;
    const info = await FileSystem.getInfoAsync(persistentDir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(persistentDir, { intermediates: true });
    const destination = `${persistentDir}${safeSegment(input.ownerId)}-${input.kind}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from, to: destination });
    return destination;
  };

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

    // Web / no document dir: nothing persistent to copy into.
    if (!persistentDir) {
      return { uri: processed.uri, width: processed.width, height: processed.height };
    }

    const uri = await copyIntoPersistent(processed.uri);
    return { uri, width: processed.width, height: processed.height };
  } catch {
    // Manipulation failed — still copy the ORIGINAL into persistent storage so
    // the record never points at a purgeable cache/temp file. Only if even that
    // fails do we fall back to the source URI (best effort).
    try {
      const uri = await copyIntoPersistent(input.sourceUri);
      return { uri, width: sourceWidth, height: sourceHeight };
    } catch {
      return { uri: input.sourceUri, width: sourceWidth, height: sourceHeight };
    }
  }
}
