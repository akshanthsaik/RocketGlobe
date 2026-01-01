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

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode) return "🌍";

  try {
    const code = countryCode.toUpperCase();

    if (code.length !== 2 && code.length !== 3) return "🌍";

    // For 3-letter codes, convert to 2-letter
    const twoLetterCode = code.length === 3 ? code.substring(0, 2) : code;

    // Convert country code to flag emoji
    return String.fromCodePoint(
      ...twoLetterCode.split("").map((char) => 127397 + char.charCodeAt(0)),
    );
  } catch {
    return "🌍";
  }
}

/**
 * Get country name from country code
 */
export const COUNTRY_NAMES: Record<string, string> = {
  USA: "United States",
  RUS: "Russia",
  CHN: "China",
  IND: "India",
  JPN: "Japan",
  ESA: "Europe",
  KOR: "South Korea",
  IRN: "Iran",
  ISR: "Israel",
  NZL: "New Zealand",
};

export function getCountryName(countryCode?: string | null): string {
  if (!countryCode) return "Unknown";
  return COUNTRY_NAMES[countryCode.toUpperCase()] || countryCode;
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
  Falcon: "#60a5fa",
  Soyuz: "#f87171",
  Atlas: "#fb923c",
  Delta: "#fbbf24",
  Ariane: "#4ade80",
  Proton: "#22d3ee",
  "Long March": "#f472b6",
  GSLV: "#a78bfa",
  "H-IIA": "#60a5fa",
  Epsilon: "#22d3ee",
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
  USA: "#60a5fa",
  RUS: "#f87171",
  CHN: "#fbbf24",
  IND: "#4ade80",
  JPN: "#f472b6",
  ESA: "#22d3ee",
  KOR: "#fb923c",
  IRN: "#a78bfa",
  ISR: "#10b981",
  NZL: "#8b5cf6",
};

export function getCountryColor(countryCode?: string | null): string {
  if (!countryCode) return "#a3a3a3";
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

  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
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
