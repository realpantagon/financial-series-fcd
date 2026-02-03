export type FCDTxType = "FX" | "GOLD_BUY" | "GOLD_SELL" | "INTEREST" | "TRANSFER"

export interface FCDEntry {
  id: number;
  tx_type: FCDTxType;
  status: string;
  date: string;
  usd: number;
  thb: number | null;
  rate: number | null;
  note: string | null;
  created_at?: string;
}

export interface NewFCDEntry {
  tx_type: FCDTxType;
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
