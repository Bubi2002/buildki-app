import { decodeUnicodeEscapes } from "./display-text";
import type { PlanPin } from "./floor-plan-store";

export type FloorPlanProtocolReference = {
  id: string;
  title: string;
  createdAt: string;
  protocolNumber?: string;
  status?: string;
};

export function normalizePlanPinText(pin: PlanPin): PlanPin {
  const label = decodeUnicodeEscapes(pin.label);
  const description = pin.description ? decodeUnicodeEscapes(pin.description) : undefined;
  const protocolTitle = pin.protocolTitle ? decodeUnicodeEscapes(pin.protocolTitle) : undefined;

  if (
    label === pin.label
    && description === pin.description
    && protocolTitle === pin.protocolTitle
  ) {
    return pin;
  }

  return {
    ...pin,
    label,
    description,
    protocolTitle,
  };
}

export function updatePlanPinText(
  pin: PlanPin,
  labelInput: string,
  descriptionInput: string,
): PlanPin {
  const label = decodeUnicodeEscapes(labelInput).trim();
  const description = decodeUnicodeEscapes(descriptionInput).trim();

  return {
    ...pin,
    label,
    description: description || undefined,
  };
}

export function linkPlanPinToProtocol(
  pin: PlanPin,
  protocol: Pick<FloorPlanProtocolReference, "id" | "title">,
): PlanPin {
  return {
    ...normalizePlanPinText(pin),
    protocolId: protocol.id,
    protocolTitle: decodeUnicodeEscapes(protocol.title).trim(),
  };
}

export function parseProjectProtocolReferences(
  rawValue: string | null,
  projectId: string,
): FloorPlanProtocolReference[] {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => (
        Boolean(item)
        && typeof item === "object"
        && typeof item.id === "string"
        && typeof item.title === "string"
        && item.projectId === projectId
      ))
      .map((item) => ({
        id: item.id as string,
        title: decodeUnicodeEscapes(item.title as string),
        createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
        protocolNumber: typeof item.protocolNumber === "string" ? item.protocolNumber : undefined,
        status: typeof item.status === "string" ? item.status : undefined,
      }))
      .sort((left, right) => (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      ));
  } catch {
    return [];
  }
}
