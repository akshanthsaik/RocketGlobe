// src/lib/utils.ts
import type { Launch } from "./api";

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
export function formatDateParts(
  dateString?: string | null,
): { date: string; time: string } {
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
 * Format time in 24-hour format
 */
export function formatTime(dateString?: string | null): string {
  if (!dateString) return "TBD";

  try {
    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return "Invalid Date";
    }

    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Format relative time (e.g., "in 3 days", "2 hours ago")
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "TBD";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffSecs = Math.abs(Math.floor(diffMs / 1000));
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const isPast = diffMs < 0;
    const prefix = isPast ? "" : "in ";
    const suffix = isPast ? " ago" : "";

    if (diffDays > 30) {
      const months = Math.floor(diffDays / 30);
      return `${prefix}${months} month${months > 1 ? "s" : ""}${suffix}`;
    }
    if (diffDays > 0) {
      return `${prefix}${diffDays} day${diffDays > 1 ? "s" : ""}${suffix}`;
    }
    if (diffHours > 0) {
      return `${prefix}${diffHours} hour${diffHours > 1 ? "s" : ""}${suffix}`;
    }
    if (diffMins > 0) {
      return `${prefix}${diffMins} minute${diffMins > 1 ? "s" : ""}${suffix}`;
    }

    return "now";
  } catch {
    return "TBD";
  }
}

/**
 * Get status color based on launch status
 */
export function getStatusColor(status?: string | null): string {
  if (!status) return "gray";

  const statusLower = status.toLowerCase();

  if (statusLower.includes("success")) return "green";
  if (statusLower.includes("failure") || statusLower.includes("failed"))
    return "red";
  if (statusLower.includes("partial")) return "orange";
  if (statusLower.includes("hold")) return "orange";
  if (statusLower.includes("tbd") || statusLower.includes("determined"))
    return "yellow";
  if (statusLower.includes("go")) return "blue";

  return "gray";
}

/**
 * Get status badge color (CSS var)
 */
export function getStatusBadgeColor(status?: string | null): string {
  const colorMap: Record<string, string> = {
    green: "var(--accent-green)",
    red: "var(--accent-red)",
    orange: "var(--accent-orange)",
    yellow: "var(--accent-yellow)",
    blue: "var(--accent-blue)",
    gray: "var(--text-tertiary)",
  };

  return colorMap[getStatusColor(status)] || colorMap["gray"];
}

/**
 * Calculate countdown to launch
 */
export function getCountdown(dateString?: string | null): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
  display: string;
} | null {
  if (!dateString) return null;

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    const isPast = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);

    const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((absDiffMs % (1000 * 60)) / 1000);

    let display = "";
    if (days > 0) display = `${days}d ${hours}h`;
    else if (hours > 0) display = `${hours}h ${minutes}m`;
    else if (minutes > 0) display = `${minutes}m ${seconds}s`;
    else display = `${seconds}s`;

    return { days, hours, minutes, seconds, isPast, display };
  } catch {
    return null;
  }
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

export function normalizeCountryCode(countryCode?: string | null): string | null {
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
 * Get country name from country code
 */
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  USA: "United States",
  RU: "Russia",
  RUS: "Russia",
  CN: "China",
  CHN: "China",
  IN: "India",
  IND: "India",
  JP: "Japan",
  JPN: "Japan",
  KR: "South Korea",
  KOR: "South Korea",
  IR: "Iran",
  IRN: "Iran",
  IL: "Israel",
  ISR: "Israel",
  NZ: "New Zealand",
  NZL: "New Zealand",
  GB: "United Kingdom",
  GBR: "United Kingdom",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  ES: "Spain",
  EU: "European Union",
  ESA: "European Space Agency",
};

const REGION_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function getCountryName(countryCode?: string | null): string {
  if (!countryCode) return "Unknown";

  const normalized = normalizeCountryCode(countryCode);
  if (normalized && REGION_NAMES) {
    const name = REGION_NAMES.of(normalized);
    if (name) return name;
  }

  const direct = COUNTRY_NAMES[countryCode.toUpperCase()];
  if (direct) return direct;

  if (normalized && COUNTRY_NAMES[normalized]) return COUNTRY_NAMES[normalized];

  return countryCode;
}
/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

/**
 * Group launches by date
 */
export function groupLaunchesByDate(
  launches: Launch[],
): Record<string, Launch[]> {
  const groups: Record<string, Launch[]> = {};

  launches.forEach((launch) => {
    if (!launch.net) {
      if (!groups["TBD"]) groups["TBD"] = [];
      groups["TBD"].push(launch);
      return;
    }

    const date = new Date(launch.net);
    const dateKey = date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(launch);
  });

  return groups;
}

/**
 * Sort launches by date
 */
export function sortLaunchesByDate(
  launches: Launch[],
  ascending = true,
): Launch[] {
  return [...launches].sort((a, b) => {
    if (!a.net && !b.net) return 0;
    if (!a.net) return 1;
    if (!b.net) return -1;

    const dateA = new Date(a.net).getTime();
    const dateB = new Date(b.net).getTime();

    return ascending ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Calculate statistics from launches
 */
export function calculateLaunchStats(launches: Launch[]) {
  const total = launches.length;

  const byStatus = launches.reduce(
    (acc, launch) => {
      const status = launch.status || "Unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const successful = Object.entries(byStatus)
    .filter(([status]) => status.toLowerCase().includes("success"))
    .reduce((sum, [, count]) => sum + count, 0);

  const failed = Object.entries(byStatus)
    .filter(
      ([status]) =>
        status.toLowerCase().includes("failure") ||
        status.toLowerCase().includes("failed"),
    )
    .reduce((sum, [, count]) => sum + count, 0);

  const successRate =
    total > 0 ? ((successful / total) * 100).toFixed(1) : "0.0";

  return {
    total,
    successful,
    failed,
    successRate: parseFloat(successRate),
    byStatus,
  };
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate color for rocket family
 */
export const ROCKET_FAMILY_COLORS: Record<string, string> = {
  Falcon: "#cfd4dc",
  Soyuz: "#c6ccd6",
  Atlas: "#bec5d0",
  Delta: "#b7c0cc",
  Ariane: "#b0bac8",
  Proton: "#a9b4c2",
  "Long March": "#a2adbc",
  GSLV: "#9ca7b6",
  "H-IIA": "#96a1b1",
  Epsilon: "#909bac",
};

export function getRocketFamilyColor(family?: string | null): string {
  if (!family) return "#a3a3a3";

  for (const [key, color] of Object.entries(ROCKET_FAMILY_COLORS)) {
    if (family.toLowerCase().includes(key.toLowerCase())) {
      return color;
    }
  }

  return "#a3a3a3";
}

/**
 * Generate color for country
 */
export const COUNTRY_COLORS: Record<string, string> = {
  US: "#cfd4dc",
  RU: "#c8ced8",
  CN: "#c1c8d3",
  IN: "#bac2ce",
  JP: "#b3bcc9",
  EU: "#adb6c4",
  KR: "#a7b1bf",
  IR: "#a1abbb",
  IL: "#9ba6b7",
  NZ: "#96a1b2",
  GB: "#909bad",
  FR: "#8a95a8",
  DE: "#858fa4",
  IT: "#808a9f",
  ES: "#7b859a",
};

export function getCountryColor(countryCode?: string | null): string {
  if (!countryCode) return "#a3a3a3";
  const normalized = normalizeCountryCode(countryCode);
  if (normalized && COUNTRY_COLORS[normalized]) return COUNTRY_COLORS[normalized];
  return COUNTRY_COLORS[countryCode.toUpperCase()] || "#a3a3a3";
}

/**
 * Format number with commas
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return "0";
  return num.toLocaleString("en-US");
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
  const degree = "\u00B0";

  return `${Math.abs(lat).toFixed(4)}${degree} ${latDir}, ${Math.abs(lon).toFixed(4)}${degree} ${lonDir}`;
}

/**
 * Check if date is in the past
 */
export function isPastDate(dateString?: string | null): boolean {
  if (!dateString) return false;
  try {
    return new Date(dateString) < new Date();
  } catch {
    return false;
  }
}

/**
 * Check if date is today
 */
export function isToday(dateString?: string | null): boolean {
  if (!dateString) return false;
  try {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  } catch {
    return false;
  }
}

/**
 * Get days until launch
 */
export function getDaysUntilLaunch(dateString?: string | null): number | null {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

