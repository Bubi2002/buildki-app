import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const PROJECT_PHOTOS_KEY = "project-direct-photos-v1";
const PROJECT_PHOTOS_DIRECTORY = "project-photos";

export type DirectProjectPhotoSource = "camera" | "library";

export type DirectProjectPhoto = {
  id: string;
  projectId: string;
  uri: string;
  originalFileName: string;
  storedFileName: string;
  source: DirectProjectPhotoSource;
  createdAt: string;
  description?: string;
  trade?: string;
  location?: string;
};

export type DirectProjectPhotoMetadata = Pick<DirectProjectPhoto, "description" | "trade" | "location">;

const normalizeText = (value?: string) => value?.trim() || undefined;

export function sanitizePhotoFileName(fileName: string): string {
  const trimmed = fileName.trim() || "foto.jpg";
  const lastDot = trimmed.lastIndexOf(".");
  const rawBase = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const rawExtension = lastDot > 0 ? trimmed.slice(lastDot + 1) : "jpg";
  const base = rawBase
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "foto";
  const extension = rawExtension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  return `${base}.${extension}`;
}

export function createCameraPhotoFileName(projectName: string, createdAt = new Date()): string {
  const project = sanitizePhotoFileName(`${projectName || "Projekt"}.jpg`).replace(/\.jpg$/i, "");
  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  return `BuildKI-${project}-${stamp}.jpg`;
}

async function getAllDirectProjectPhotos(): Promise<DirectProjectPhoto[]> {
  const raw = await AsyncStorage.getItem(PROJECT_PHOTOS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAllDirectProjectPhotos(photos: DirectProjectPhoto[]): Promise<void> {
  await AsyncStorage.setItem(PROJECT_PHOTOS_KEY, JSON.stringify(photos));
}

export async function getDirectProjectPhotos(projectId: string): Promise<DirectProjectPhoto[]> {
  if (!projectId.trim()) return [];
  const all = await getAllDirectProjectPhotos();
  return all
    .filter((photo) => photo.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function persistDirectProjectPhoto(input: {
  projectId: string;
  projectName: string;
  sourceUri: string;
  originalFileName?: string | null;
  source: DirectProjectPhotoSource;
  createdAt?: Date;
}): Promise<DirectProjectPhoto> {
  if (!input.projectId.trim()) throw new Error("Projekt-ID fehlt");
  if (!input.sourceUri.trim()) throw new Error("Foto-URI fehlt");

  const createdAt = input.createdAt || new Date();
  const id = `project-photo-${createdAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const originalFileName = input.originalFileName?.trim()
    || createCameraPhotoFileName(input.projectName, createdAt);
  const storedFileName = `${id}-${sanitizePhotoFileName(originalFileName)}`;
  let uri = input.sourceUri;
  if (Platform.OS !== "web" && FileSystem.documentDirectory) {
    const baseDirectory = `${FileSystem.documentDirectory}${PROJECT_PHOTOS_DIRECTORY}/${input.projectId}/`;
    const directoryInfo = await FileSystem.getInfoAsync(baseDirectory);
    if (!directoryInfo.exists) {
      await FileSystem.makeDirectoryAsync(baseDirectory, { intermediates: true });
    }
    uri = `${baseDirectory}${storedFileName}`;
    await FileSystem.copyAsync({ from: input.sourceUri, to: uri });
  }

  const photo: DirectProjectPhoto = {
    id,
    projectId: input.projectId,
    uri,
    originalFileName,
    storedFileName,
    source: input.source,
    createdAt: createdAt.toISOString(),
  };
  const all = await getAllDirectProjectPhotos();
  await saveAllDirectProjectPhotos([photo, ...all]);
  return photo;
}

export async function updateDirectProjectPhoto(
  photoId: string,
  metadata: DirectProjectPhotoMetadata,
): Promise<DirectProjectPhoto | null> {
  const all = await getAllDirectProjectPhotos();
  const index = all.findIndex((photo) => photo.id === photoId);
  if (index < 0) return null;
  const updated: DirectProjectPhoto = {
    ...all[index],
    description: normalizeText(metadata.description),
    trade: normalizeText(metadata.trade),
    location: normalizeText(metadata.location),
  };
  all[index] = updated;
  await saveAllDirectProjectPhotos(all);
  return updated;
}

export async function deleteDirectProjectPhoto(photoId: string): Promise<boolean> {
  const all = await getAllDirectProjectPhotos();
  const photo = all.find((item) => item.id === photoId);
  if (!photo) return false;
  await saveAllDirectProjectPhotos(all.filter((item) => item.id !== photoId));
  try {
    if (Platform.OS !== "web" && photo.uri.startsWith(FileSystem.documentDirectory || "file://")) {
      const info = await FileSystem.getInfoAsync(photo.uri);
      if (info.exists) await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    }
  } catch {
    // Metadata deletion remains authoritative even if the local file is already gone.
  }
  return true;
}
