// ============================================================================
// UNIFIED TYPE DEFINITIONS
// Single source of truth for all data types
// ============================================================================

export interface Launch {
  id: number;
  ll2_id: string;
  name: string;
  status?: string | null;
  net?: string | null;
  image_url?: string | null;
  pad_id?: number | null;
  rocket_id?: number | null;
  agency_id?: number | null;
  window_start?: string | null;
  window_end?: string | null;
}

export interface Pad {
  id: number;
  ll2_id: number;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  country_code?: string | null;
  map_url?: string | null;
  total_launch_count: number;
}

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

// ============================================================================
// VIEW TYPES
// ============================================================================

export type ViewType = 
  | 'launch-list' 
  | 'launch-detail' 
  | 'pad-detail' 
  | 'rocket-detail' 
  | 'agency-detail';

export interface View {
  type: ViewType;
  data?: any;
}

// ============================================================================
// API TYPES
// ============================================================================

export interface APIResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface LaunchParams extends PaginationParams {
  status?: string;
  agency_id?: number;
  start_date?: string;
  end_date?: string;
}

export interface PadParams extends PaginationParams {
  country_code?: string;
}

export interface AgencyParams extends PaginationParams {
  country_code?: string;
  type?: string;
}

export interface RocketParams extends PaginationParams {
  family?: string;
  is_active?: boolean;
}
