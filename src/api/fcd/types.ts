export interface FCDEntry {
  id: number;
  status: string;
  date: string;
  usd: number;
  thb: number | null;
  rate: number | null;
  note: string | null;
  created_at?: string;
}

export interface NewFCDEntry {
  status: string;
  date: string;
  usd: number;
  thb?: number | null;
  rate?: number | null;
  note?: string | null;
}

export interface FCDStats {
  total_usd: number;
  total_thb: number;
  weighted_avg_rate: number;
  total_value_thb: number;
  total_value_usd: number;
  total_entries: number;
  active_entries: number;
}
