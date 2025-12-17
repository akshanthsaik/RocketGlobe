import type { Launch } from './api';

/**
 * Format date to readable string with time
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString) return 'TBD';
  
  try {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format date to short format (no time)
 */
export function formatDateShort(dateString?: string | null): string {
  if (!dateString) return 'TBD';
  
  try {
    const date = new Date(dateString);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return 'Invalid Date';
  }
}

/**
 * Format relative time (e.g., "in 3 days", "2 hours ago")
 */
export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'TBD';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffSecs = Math.abs(Math.floor(diffMs / 1000));
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    const isPast = diffMs < 0;
    const prefix = isPast ? '' : 'in ';
    const suffix = isPast ? ' ago' : '';
    
    if (diffDays > 30) {
      const months = Math.floor(diffDays / 30);
      return `${prefix}${months} month${months > 1 ? 's' : ''}${suffix}`;
    }
    if (diffDays > 0) {
      return `${prefix}${diffDays} day${diffDays > 1 ? 's' : ''}${suffix}`;
    }
    if (diffHours > 0) {
      return `${prefix}${diffHours} hour${diffHours > 1 ? 's' : ''}${suffix}`;
    }
    if (diffMins > 0) {
      return `${prefix}${diffMins} minute${diffMins > 1 ? 's' : ''}${suffix}`;
    }
    
    return 'now';
  } catch {
    return 'TBD';
  }
}

/**
 * Get status color class based on launch status
 */
export function getStatusColor(status?: string | null): string {
  if (!status) return 'gray';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('success')) return 'green';
  if (statusLower.includes('fail')) return 'red';
  if (statusLower.includes('partial')) return 'orange';
  if (statusLower.includes('hold') || statusLower.includes('tbd') || statusLower.includes('determined')) return 'orange';
  if (statusLower.includes('go')) return 'blue';
  
  return 'gray';
}

/**
 * Get launch status emoji
 */
export function getStatusEmoji(status?: string | null): string {
  if (!status) return '❓';
  
  const statusLower = status.toLowerCase();
  
  if (statusLower.includes('success')) return '✅';
  if (statusLower.includes('fail')) return '❌';
  if (statusLower.includes('partial')) return '⚠️';
  if (statusLower.includes('hold')) return '⏸️';
  if (statusLower.includes('tbd')) return '🕐';
  if (statusLower.includes('go')) return '🚀';
  
  return '❓';
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
} | null {
  if (!dateString) return null;
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    
    const isPast = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);
    
    const days = Math.floor(absDiffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((absDiffMs % (1000 * 60)) / 1000);
    
    return { days, hours, minutes, seconds, isPast };
  } catch {
    return null;
  }
}

/**
 * Get country flag emoji from country code
 */
export function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode) return '🌍';
  
  try {
    const code = countryCode.toUpperCase();
    
    // Convert country code to flag emoji
    // Each letter is offset by 127397 from its ASCII value
    return String.fromCodePoint(
      ...code.split('').map(char => 127397 + char.charCodeAt(0))
    );
  } catch {
    return '🌍';
  }
}

/**
 * Truncate text to max length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Group launches by date
 */
export function groupLaunchesByDate(launches: Launch[]): Record<string, Launch[]> {
  const groups: Record<string, Launch[]> = {};
  
  launches.forEach(launch => {
    if (!launch.net) {
      if (!groups['TBD']) groups['TBD'] = [];
      groups['TBD'].push(launch);
      return;
    }
    
    const date = new Date(launch.net);
    const dateKey = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(launch);
  });
  
  return groups;
}

/**
 * Sort launches by date
 */
export function sortLaunchesByDate(launches: Launch[], ascending = true): Launch[] {
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
  
  const byStatus = launches.reduce((acc, launch) => {
    const status = launch.status || 'Unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const successful = Object.entries(byStatus)
    .filter(([status]) => status.toLowerCase().includes('success'))
    .reduce((sum, [, count]) => sum + count, 0);
  
  const failed = Object.entries(byStatus)
    .filter(([status]) => status.toLowerCase().includes('failure') || status.toLowerCase().includes('failed'))
    .reduce((sum, [, count]) => sum + count, 0);
  
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(1) : '0.0';
  
  return {
    total,
    successful,
    failed,
    successRate: parseFloat(successRate),
    byStatus
  };
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
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
 * Generate random color for markers
 */
export function getRandomColor(): string {
  const colors = [
    '#4a8aea',
    '#00d9ff',
    '#00ff88',
    '#ff8c42',
    '#ff4757',
    '#a55eea'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Format latitude/longitude coordinates
 */
export function formatCoordinates(lat?: number | null, lon?: number | null): string {
  if (lat === undefined || lat === null || lon === undefined || lon === null) {
    return 'Unknown';
  }
  
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}
