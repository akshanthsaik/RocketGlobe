// src/lib/utils.ts

/**
 * Format date to readable string with time
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return "TBD";

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Format date for compact card display (date + time)
 */
export function formatDateParts(dateString?: string | null): {
  date: string;
  time: string;
} {
  if (!dateString) return { date: "TBD", time: "" };

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return { date: "Invalid Date", time: "" };
    }

    const datePart = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const timePart = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    return { date: datePart, time: timePart };
  } catch {
    return { date: "Invalid Date", time: "" };
  }
}

/**
 * Format date to short format (no time)
 */
export function formatDateShort(dateString?: string | null): string {
  if (!dateString) return "TBD";

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Launch status, restated in plain English.
 *
 * The feed's own strings ("TBD", "Success (Partial Failure)") are accurate but
 * unreadable, so the UI shows a short human label and carries the raw string
 * through as a tooltip. `variant` drives the chip's colour treatment.
 */
export type LaunchChipVariant =
  | "go"
  | "pending"
  | "hold"
  | "flew"
  | "qualified"
  | "lost"
  | "unknown";

export interface LaunchChip {
  label: string;
  variant: LaunchChipVariant;
  /** The feed's original status string, for `title`. Null when unrecorded. */
  raw: string | null;
}

export function getLaunchChip(status?: string | null): LaunchChip {
  if (!status) {
    return { label: "Unrecorded", variant: "unknown", raw: null };
  }

  const s = status.toLowerCase();

  // Order matters: "Success (Partial Failure)" contains all three of
  // "success", "partial" and "failure", and reads as a qualified success.
  if (s.includes("hold")) {
    return { label: "On hold", variant: "hold", raw: status };
  }
  if (s.includes("partial")) {
    return { label: "Flew, qualified", variant: "qualified", raw: status };
  }
  if (s.includes("failure") || s.includes("failed")) {
    return { label: "Lost", variant: "lost", raw: status };
  }
  if (s.includes("success")) {
    return { label: "Flew", variant: "flew", raw: status };
  }
  if (s.includes("go")) {
    return { label: "Go for launch", variant: "go", raw: status };
  }
  return { label: "Date not fixed", variant: "pending", raw: status };
}

const DEFAULT_COUNTRY_LABEL = "WORLD";

const ALPHA3_TO_ALPHA2: Record<string, string> = {
  USA: "US",
  RUS: "RU",
  CHN: "CN",
  IND: "IN",
  JPN: "JP",
  KOR: "KR",
  PRK: "KP",
  IRN: "IR",
  ISR: "IL",
  NZL: "NZ",
  GBR: "GB",
  FRA: "FR",
  DEU: "DE",
  ITA: "IT",
  ESP: "ES",
  AUS: "AU",
  CAN: "CA",
  BRA: "BR",
  MEX: "MX",
  ARG: "AR",
  ZAF: "ZA",
  UKR: "UA",
  KAZ: "KZ",
  UAE: "AE",
  ARE: "AE",
  SAU: "SA",
  TUR: "TR",
  SWE: "SE",
  NOR: "NO",
  FIN: "FI",
  DNK: "DK",
  NLD: "NL",
  BEL: "BE",
  CHE: "CH",
  AUT: "AT",
  CZE: "CZ",
  SVK: "SK",
  HUN: "HU",
  ROU: "RO",
  BGR: "BG",
  GRC: "GR",
  PRT: "PT",
  IRL: "IE",
  ISL: "IS",
  CHL: "CL",
  COL: "CO",
  PER: "PE",
  VEN: "VE",
  EGY: "EG",
  DZA: "DZ",
  MAR: "MA",
  TUN: "TN",
  QAT: "QA",
  KWT: "KW",
  OMN: "OM",
  PAK: "PK",
  IDN: "ID",
  THA: "TH",
  MYS: "MY",
  SGP: "SG",
  VNM: "VN",
  PHL: "PH",
  NGA: "NG",
  KEN: "KE",
  ETH: "ET",
};

export function normalizeCountryCode(
  countryCode?: string | null,
): string | null {
  if (!countryCode) return null;
  const cleaned = countryCode.trim().toUpperCase();
  const alphaOnly = cleaned.replace(/[^A-Z]/g, "");
  if (!alphaOnly) return null;
  if (alphaOnly === "UK") return "GB";
  if (alphaOnly.length === 2) return alphaOnly;
  if (alphaOnly.length === 3) return ALPHA3_TO_ALPHA2[alphaOnly] || null;
  return null;
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode?: string | null): string {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized || normalized.length !== 2) return DEFAULT_COUNTRY_LABEL;
  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

/**
 * Debounce function for search inputs
 */
export interface DebouncedFunction<T extends (...args: Parameters<T>) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number,
): DebouncedFunction<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const executedFunction = (...args: Parameters<T>) => {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };

  executedFunction.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };

  return executedFunction;
}

/**
 * Format latitude/longitude coordinates
 */
export function formatCoordinates(
  lat?: number | null,
  lon?: number | null,
): string {
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    return "Unknown";
  }

  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  const degree = "°";

  return `${Math.abs(lat).toFixed(4)}${degree} ${latDir}, ${Math.abs(lon).toFixed(4)}${degree} ${lonDir}`;
}
