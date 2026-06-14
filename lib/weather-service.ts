import { LocationData } from "./location-service";

export type WeatherData = {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
};

/**
 * Fetches current weather data based on GPS coordinates.
 * Uses Open-Meteo API (free, no API key required).
 */
export async function getWeatherForLocation(
  location: LocationData
): Promise<WeatherData | null> {
  try {
    const { latitude, longitude } = location;
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const current = data.current;

    const weatherCode = current.weather_code;
    const description = getWeatherDescription(weatherCode);
    const icon = getWeatherIcon(weatherCode);

    return {
      temperature: Math.round(current.temperature_2m * 10) / 10,
      description,
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
      icon,
    };
  } catch (error) {
    console.error("Error fetching weather:", error);
    return null;
  }
}

function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: "Klar",
    1: "Überwiegend klar",
    2: "Teilweise bewölkt",
    3: "Bedeckt",
    45: "Nebel",
    48: "Gefrierender Nebel",
    51: "Leichter Nieselregen",
    53: "Mäßiger Nieselregen",
    55: "Starker Nieselregen",
    61: "Leichter Regen",
    63: "Mäßiger Regen",
    65: "Starker Regen",
    71: "Leichter Schneefall",
    73: "Mäßiger Schneefall",
    75: "Starker Schneefall",
    80: "Leichte Regenschauer",
    81: "Mäßige Regenschauer",
    82: "Starke Regenschauer",
    95: "Gewitter",
    96: "Gewitter mit leichtem Hagel",
    99: "Gewitter mit starkem Hagel",
  };
  return descriptions[code] || "Unbekannt";
}

function getWeatherIcon(code: number): string {
  if (code === 0) return "wb-sunny";
  if (code <= 3) return "cloud";
  if (code <= 48) return "foggy";
  if (code <= 55) return "grain";
  if (code <= 65) return "water-drop";
  if (code <= 75) return "ac-unit";
  if (code <= 82) return "shower";
  return "thunderstorm";
}

export function formatWeatherForProtocol(weather: WeatherData): string {
  return `${weather.description}, ${weather.temperature}°C, Luftfeuchtigkeit ${weather.humidity}%, Wind ${weather.windSpeed} km/h`;
}
