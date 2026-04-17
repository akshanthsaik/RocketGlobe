export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

export const API_ORIGIN = new URL(API_BASE_URL).origin;

// Types matching backend schemas
export interface Agency {
  id: number;
  ll2_id?: number | null;
  name: string;
  abbrev?: string | null;
  type?: string | null;
  country_code?: string | null;
  founding_year?: number | null;
  administrator?: string | null;
  description?: string | null;
  logo_url?: string | null;
  is_active: boolean;
}

export interface Pad {
  id: number;
  ll2_id?: number | null;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string | null;
  map_url?: string | null;
  total_launch_count: number;
  agency_id?: number | null;
}

export interface Rocket {
  id: number;
  ll2_id?: number | null;
  name: string;
  family?: string | null;
  variant?: string | null;
  full_name?: string | null;
  description?: string | null;
  length?: number | null;
  diameter?: number | null;
  leo_capacity?: number | null;
  gto_capacity?: number | null;
  launch_mass?: number | null;
  thrust?: number | null;
  is_reusable?: boolean | null;
  manufacturer_id?: number | null;
  is_active: boolean;
}

export interface Launch {
  id: number;
  ll2_id?: string | null;
  name: string;
  status?: string | null;
  net?: string | null;
  image_url?: string | null;
  pad_id?: number | null;
  rocket_id?: number | null;
  agency_id?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  mission_name?: string | null;
  mission_description?: string | null;
  mission_type?: string | null;
  orbit?: string | null;
  webcast_live?: boolean | null;
  video_url?: string | null;
}

export const LAUNCH_STATUS = {
  UPCOMING: ["Go", "TBD", "TBC", "On Hold", "To Be Confirmed", "To Be Determined"],
  DECIDED: ["Go for Launch", "Go"],
  PREVIOUS: ["Success", "Failure", "Partial Failure", "Success (Partial Failure)"],
} as const;

class RocketGlobeAPI {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    return this.fetchAbsolute<T>(url);
  }

  private async fetchAbsolute<T>(url: string): Promise<T> {
    try {
      const response = await fetch(url, { method: "GET" });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText || response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Unknown error fetching ${url}`);
    }
  }

  // Launches
  async getLaunches(params?: {
    skip?: number;
    limit?: number;
    status?: string;
    agency_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<Launch[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    const endpoint = `/launches/${query.toString() ? `?${query}` : ""}`;
    return this.fetch<Launch[]>(endpoint);
  }

  async getLaunch(id: number): Promise<Launch> {
    return this.fetch<Launch>(`/launches/${id}`);
  }

  async getUpcomingLaunches(limit: number = 10): Promise<Launch[]> {
    return this.fetch<Launch[]>(`/launches/upcoming/?limit=${limit}`);
  }

  // Pads
  async getPads(params?: {
    skip?: number;
    limit?: number;
    country_code?: string;
  }): Promise<Pad[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    const endpoint = `/pads/${query.toString() ? `?${query}` : ""}`;
    return this.fetch<Pad[]>(endpoint);
  }

  async getPad(id: number): Promise<Pad> {
    return this.fetch<Pad>(`/pads/${id}`);
  }

  // Agencies
  async getAgencies(params?: {
    skip?: number;
    limit?: number;
    country_code?: string;
    type?: string;
    is_active?: boolean;
  }): Promise<Agency[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    const endpoint = `/agencies/${query.toString() ? `?${query}` : ""}`;
    return this.fetch<Agency[]>(endpoint);
  }

  async getAgency(id: number): Promise<Agency> {
    return this.fetch<Agency>(`/agencies/${id}`);
  }

  // Rockets
  async getRockets(params?: {
    skip?: number;
    limit?: number;
    family?: string;
    is_active?: boolean;
  }): Promise<Rocket[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    const endpoint = `/rockets/${query.toString() ? `?${query}` : ""}`;
    return this.fetch<Rocket[]>(endpoint);
  }

  async getRocket(id: number): Promise<Rocket> {
    return this.fetch<Rocket>(`/rockets/${id}`);
  }

  async healthCheck(): Promise<{ status: string; database?: string; data?: unknown }> {
    const url = `${API_ORIGIN}/health`;
    return this.fetchAbsolute<{ status: string; database?: string; data?: unknown }>(url);
  }
}

export const api = new RocketGlobeAPI();
