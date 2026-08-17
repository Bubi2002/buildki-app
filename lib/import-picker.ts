/**
 * Unified image import: lets the user pick the source (photo library vs.
 * Files / Cloud — the Files app also exposes Dropbox, Drive, iCloud…) and
 * returns the selected images. Reused across every tool that imports photos so
 * the choice is consistent everywhere.
 */
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { importFromCloud } from "@/lib/cloud-import-service";

type Translate = (key: any) => string;

export type PickedImage = {
  uri: string;
  base64?: string;
  mimeType?: string;
  fileName?: string;
};

export function pickImagesWithSource(opts: {
  t: Translate;
  multiple?: boolean;
  /** Also return base64 (needed for on-device/AI analysis uploads). */
  withBase64?: boolean;
}): Promise<PickedImage[]> {
  const { t, multiple = false, withBase64 = false } = opts;

  return new Promise((resolve) => {
    let settled = false;
    const done = (images: PickedImage[]) => {
      if (settled) return;
      settled = true;
      resolve(images);
    };

    Alert.alert(
      t("import_source_title"),
      t("import_source_message"),
      [
        {
          text: t("import_source_gallery"),
          onPress: async () => {
            try {
              const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!permission.granted) {
                done([]);
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: multiple,
                selectionLimit: multiple ? 20 : 1,
                quality: 0.9,
                base64: withBase64,
              });
              done(
                result.canceled
                  ? []
                  : result.assets.map((asset) => ({
                      uri: asset.uri,
                      base64: asset.base64 || undefined,
                      mimeType: asset.mimeType || "image/jpeg",
                      fileName: asset.fileName || undefined,
                    })),
              );
            } catch {
              done([]);
            }
          },
        },
        {
          text: t("import_source_files"),
          onPress: async () => {
            try {
              const files = await importFromCloud({ category: "photo", multiple });
              const images: PickedImage[] = [];
              for (const file of files) {
                let base64: string | undefined;
                if (withBase64) {
                  try {
                    base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
                  } catch {
                    base64 = undefined;
                  }
                }
                images.push({ uri: file.uri, base64, mimeType: file.mimeType || "image/jpeg", fileName: file.name });
              }
              done(images);
            } catch {
              done([]);
            }
          },
        },
        { text: t("cancel"), style: "cancel", onPress: () => done([]) },
      ],
      { cancelable: true, onDismiss: () => done([]) },
    );
  });
}
