import { baseInfo } from "@/lib/baseInfo";
import type { Weather, WeatherCondition } from "@/types/siteConfig";

/**
 * Current conditions for the studio from Open-Meteo. Free, no key, no account.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT_MS = 8000;

/**
 * WMO weather interpretation codes. Open-Meteo publishes ~30 of them; they
 * collapse into the handful of conditions the site actually paints.
 */
const WMO_CONDITIONS: Record<number, WeatherCondition> = {
  0: "clear",
  1: "clear", // mainly clear
  2: "partly-cloudy",
  3: "overcast",
  45: "fog",
  48: "fog", // depositing rime fog
  51: "drizzle",
  53: "drizzle",
  55: "drizzle",
  56: "drizzle", // freezing
  57: "drizzle",
  61: "rain",
  63: "rain",
  65: "rain",
  66: "rain", // freezing
  67: "rain",
  71: "snow",
  73: "snow",
  75: "snow",
  77: "snow", // snow grains
  80: "rain", // showers
  81: "rain",
  82: "rain",
  85: "snow", // snow showers
  86: "snow",
  95: "storm",
  96: "storm", // with hail
  99: "storm",
};

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    cloud_cover?: number;
    weather_code?: number;
  };
}

export function conditionFromWmoCode(code: number): WeatherCondition {
  return WMO_CONDITIONS[code] ?? "partly-cloudy";
}

/** Throws on network failure or a malformed payload — callers decide what a missing sky means. */
export async function getWeather(): Promise<Weather> {
  const { latitude, longitude } = baseInfo.coordinates;
  const url = new URL(ENDPOINT);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,cloud_cover,weather_code");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("timezone", baseInfo.timezone);

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as OpenMeteoResponse;
  const current = payload.current;

  if (
    !current ||
    typeof current.temperature_2m !== "number" ||
    typeof current.cloud_cover !== "number" ||
    typeof current.weather_code !== "number"
  ) {
    throw new Error(`Open-Meteo payload missing current conditions: ${JSON.stringify(payload).slice(0, 200)}`);
  }

  return {
    condition: conditionFromWmoCode(current.weather_code),
    cloudCoverPct: Math.round(Math.min(100, Math.max(0, current.cloud_cover))),
    tempF: Math.round(current.temperature_2m),
  };
}
