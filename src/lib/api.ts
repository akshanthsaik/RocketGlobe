const API_BASE_URL = 'http://127.0.0.1:8000/api';

// Types matching backend schemas EXACTLY
export interface Agency {
  id: number;
  ll2_id: number;
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
  ll2_id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string | null;
  map_url?: string | null;
  total_launch_count: number;
}

export interface Rocket {
  id: number;
  ll2_id: number;
  name: string;
  family?: string | null;
  variant?: string | null;
  full_name?: string | null;
  description?: string | null;
  manufacturer_id?: number | null;
  is_active: boolean;
}

export interface Launch {
  id: number;
  ll2_id: string;
  name: string;
  status?: string | null;
  net?: string | null; // ISO datetime string
  image_url?: string | null;
  pad_id?: number | null;
  rocket_id?: number | null;
  agency_id?: number | null;
  window_start?: string | null; // ISO datetime string
  window_end?: string | null; // ISO datetime string
}

// API Client
class RocketGlobeAPI {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      console.log(`🌐 API Request: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText || response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`❌ API request failed: ${endpoint}`, error.message);
        throw error;
      }
      throw new Error(`Unknown error fetching ${endpoint}`);
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
    const endpoint = `/launches${query.toString() ? `?${query}` : ''}`;
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
    const endpoint = `/pads${query.toString() ? `?${query}` : ''}`;
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
  }): Promise<Agency[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    const endpoint = `/agencies${query.toString() ? `?${query}` : ''}`;
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
    const endpoint = `/rockets${query.toString() ? `?${query}` : ''}`;
    return this.fetch<Rocket[]>(endpoint);
  }

  async getRocket(id: number): Promise<Rocket> {
    return this.fetch<Rocket>(`/rockets/${id}`);
  }

  // Health check
  async healthCheck(): Promise<{ status: string; message: string }> {
    return this.fetch<{ status: string; message: string }>('/health');
  }
}

// Export singleton instance
export const api = new RocketGlobeAPI();

// Export API base URL for other uses
export { API_BASE_URL };
