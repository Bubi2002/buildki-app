import * as Crypto from "expo-crypto";

export function createLocalId(prefix: string): string {
  return `${prefix}_${Crypto.randomUUID()}`;
}
