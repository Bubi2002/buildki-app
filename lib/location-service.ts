import * as Location from "expo-location";
import { Platform } from "react-native";

export interface LocationData {
  latitude: number;
  longitude: number;
  address: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

/**
 * Request location permissions
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

/**
 * Get current location with reverse geocoding
 */
export async function getCurrentLocation(): Promise<LocationData | null> {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude, longitude } = position.coords;

    // Reverse geocode to get address
    let address: string | null = null;
    let street: string | null = null;
    let city: string | null = null;
    let postalCode: string | null = null;
    let country: string | null = null;

    try {
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        street = place.street || null;
        city = place.city || place.subregion || null;
        postalCode = place.postalCode || null;
        country = place.country || null;

        // Build full address string
        const parts = [];
        if (place.street) parts.push(place.street);
        if (place.streetNumber) parts[parts.length - 1] += ` ${place.streetNumber}`;
        if (place.postalCode && place.city) {
          parts.push(`${place.postalCode} ${place.city}`);
        } else if (place.city) {
          parts.push(place.city);
        }
        if (place.country) parts.push(place.country);
        address = parts.join(", ");
      }
    } catch {
      // Geocoding failed, still return coordinates
    }

    return { latitude, longitude, address, street, city, postalCode, country };
  } catch {
    return null;
  }
}

/**
 * Format location for display
 */
export function formatLocation(location: LocationData): string {
  if (location.address) return location.address;
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}
