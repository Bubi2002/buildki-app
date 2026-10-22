import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import {
  linkPlanPinToProtocol,
  normalizePlanPinText,
  type FloorPlanProtocolReference,
} from "./floor-plan-pin-actions";

// iOS assigns a new app-container UUID on every app update/reinstall, so an
// absolute path like file:///var/.../Application/<UUID>/Documents/… stops
// resolving even though the file still lives in Documents. That is why plans
// (whose image path was baked in absolutely) turned white after a few days of
// TestFlight updates. Re-anchor any stored Documents-relative path onto the
// CURRENT documentDirectory on read, so the path always points at the live
// container. No-op when the path already matches or isn't under Documents.
function resolveDocUri(uri: string): string {
  if (!uri || !uri.startsWith("file://")) return uri;
  const doc = FileSystem.documentDirectory;
  if (!doc) return uri;
  const marker = "/Documents/";
  const i = uri.indexOf(marker);
  if (i < 0) return uri;
  const rel = uri.slice(i + marker.length);
  const base = doc.endsWith("/") ? doc : `${doc}/`;
  const rebuilt = `${base}${rel}`;
  return rebuilt === uri ? uri : rebuilt;
}

const FLOOR_PLANS_KEY = "floor-plans";
const PLAN_PINS_KEY = "plan-pins";

export type FloorPlan = {
  id: string;
  projectId: string;
  name: string;
  imageUri: string;
  width: number;
  height: number;
  createdAt: string;
};

export type PlanPin = {
  id: string;
  planId: string;
  projectId: string;
  x: number; // 0-1 relative position
  y: number; // 0-1 relative position
  type: "photo" | "defect" | "note" | "protocol" | "chapter" | "task";
  label: string;
  description?: string;
  photoUri?: string;
  photos?: string[]; // multiple photos linked to this pin
  protocolId?: string;
  protocolTitle?: string;
  defectId?: string;
  color: string;
  createdAt: string;
};

export async function getFloorPlans(projectId?: string): Promise<FloorPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(FLOOR_PLANS_KEY);
    const parsed: FloorPlan[] = raw ? JSON.parse(raw) : [];
    const plans = parsed.map((p) => {
      const fixed = resolveDocUri(p.imageUri);
      return fixed === p.imageUri ? p : { ...p, imageUri: fixed };
    });
    if (projectId) return plans.filter((p) => p.projectId === projectId);
    return plans;
  } catch {
    return [];
  }
}

export async function saveFloorPlan(plan: FloorPlan): Promise<void> {
  const plans = await getFloorPlans();
  const idx = plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) plans[idx] = plan;
  else plans.push(plan);
  await AsyncStorage.setItem(FLOOR_PLANS_KEY, JSON.stringify(plans));
}

export async function deleteFloorPlan(planId: string): Promise<void> {
  const plans = await getFloorPlans();
  const filtered = plans.filter((p) => p.id !== planId);
  await AsyncStorage.setItem(FLOOR_PLANS_KEY, JSON.stringify(filtered));
  // Also delete associated pins
  const pins = await getPlanPins();
  const filteredPins = pins.filter((p) => p.planId !== planId);
  await AsyncStorage.setItem(PLAN_PINS_KEY, JSON.stringify(filteredPins));
}

export async function getPlanPins(planId?: string): Promise<PlanPin[]> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_PINS_KEY);
    const parsed: PlanPin[] = raw ? JSON.parse(raw) : [];
    const pins = parsed.map(normalizePlanPinText);
    if (pins.some((pin, index) => pin !== parsed[index])) {
      await AsyncStorage.setItem(PLAN_PINS_KEY, JSON.stringify(pins));
    }
    if (planId) return pins.filter((p) => p.planId === planId);
    return pins;
  } catch {
    return [];
  }
}

export async function savePlanPin(pin: PlanPin): Promise<void> {
  const pins = await getPlanPins();
  const normalizedPin = normalizePlanPinText(pin);
  const idx = pins.findIndex((p) => p.id === normalizedPin.id);
  if (idx >= 0) pins[idx] = normalizedPin;
  else pins.push(normalizedPin);
  await AsyncStorage.setItem(PLAN_PINS_KEY, JSON.stringify(pins));
}

export async function linkStoredPlanPinToProtocol(
  pinId: string,
  protocol: Pick<FloorPlanProtocolReference, "id" | "title">,
): Promise<PlanPin | null> {
  const pins = await getPlanPins();
  const index = pins.findIndex((pin) => pin.id === pinId);
  if (index < 0) return null;

  const updatedPin = linkPlanPinToProtocol(pins[index], protocol);
  pins[index] = updatedPin;
  await AsyncStorage.setItem(PLAN_PINS_KEY, JSON.stringify(pins));
  return updatedPin;
}

export async function deletePlanPin(pinId: string): Promise<void> {
  const pins = await getPlanPins();
  const filtered = pins.filter((p) => p.id !== pinId);
  await AsyncStorage.setItem(PLAN_PINS_KEY, JSON.stringify(filtered));
}

export async function getPinsForProject(projectId: string): Promise<PlanPin[]> {
  const pins = await getPlanPins();
  return pins.filter((p) => p.projectId === projectId);
}
