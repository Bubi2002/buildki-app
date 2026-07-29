import { getDefects, saveDefect, type Defect, type DefectComment } from "./defect-store";

/**
 * Add a comment to a defect
 */
export async function addDefectComment(
  defectId: string,
  author: string,
  text: string
): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const comment: DefectComment = {
    id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    author,
    text,
    createdAt: new Date().toISOString(),
  };

  const updated: Defect = {
    ...defect,
    comments: [...(defect.comments || []), comment],
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Add a "before" photo to a defect (Vorher-Foto)
 */
export async function addBeforePhoto(defectId: string, photoUri: string): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    beforePhotos: [...(defect.beforePhotos || []), photoUri],
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Add an "after" photo to a defect (Nachher-Foto)
 */
export async function addAfterPhoto(defectId: string, photoUri: string): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    afterPhotos: [...(defect.afterPhotos || []), photoUri],
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Set follow-up inspection date
 */
export async function setFollowUpDate(defectId: string, date: string): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    followUpDate: date,
  };
  await saveDefect(updated);
  return updated;
}

/**
 * Request re-inspection (sets status to "pruefung" and follow-up date)
 */
export async function requestReinspection(defectId: string, followUpDate: string, followUpNote?: string): Promise<Defect | null> {
  const defects = await getDefects();
  const defect = defects.find((d) => d.id === defectId);
  if (!defect) return null;

  const updated: Defect = {
    ...defect,
    status: "pruefung",
    followUpDate,
    followUpNote: followUpNote?.trim() || undefined,
  };
  await saveDefect(updated);
  return updated;
}
