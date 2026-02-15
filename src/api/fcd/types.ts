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
  total_in: number;
  total_out: number;
  cash_remain: number;
  gold_profit: number;
  interest_income: number;
  
  // Deprecated / Legacy support if needed, but we should try to use new ones
  total_usd: number; // Keeping for now to avoid immediate break, but will map to total_in or similar
  total_thb: number;
  weighted_avg_rate: number;
  total_value_thb: number;
  total_value_usd: number;
  total_entries: number;
  active_entries: number;
}
