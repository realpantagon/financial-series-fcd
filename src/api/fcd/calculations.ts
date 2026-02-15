import type { FCDEntry, FCDStats } from './types';

export function calculateFCDStats(entries: FCDEntry[]): FCDStats {
  // 1. Total IN (IN + Interest)
  const total_in = entries
    .filter(e => e.status === 'IN' || e.status === 'Interest')
    .reduce((sum, e) => sum + Number(e.usd), 0);

  // 2. Total OUT (OUT only)
  // Note: GOLD_BUY should be OUT status.
  const total_out = entries
    .filter(e => e.status === 'OUT')
    .reduce((sum, e) => sum + Number(e.usd), 0);

  // 3. Cash Remain
  const cash_remain = total_in - total_out;

  // 4. Gold Trading Profit
  // Sum of GOLD_SELL - Sum of GOLD_BUY
  // Ensure we use absolute amounts and strict type matching
  const gold_sell = entries
    .filter(e => (e.tx_type || '').trim() === 'GOLD_SELL')
    .reduce((sum, e) => sum + Math.abs(Number(e.usd) || 0), 0);
  
  const gold_buy = entries
    .filter(e => (e.tx_type || '').trim() === 'GOLD_BUY')
    .reduce((sum, e) => sum + Math.abs(Number(e.usd) || 0), 0);
  
  const gold_profit = gold_sell - gold_buy;

  // 5. Interest Income
  const interest_income = entries
    .filter(e => e.status === 'Interest')
    .reduce((sum, e) => sum + Number(e.usd), 0);

  // Legacy / existing metrics support
  const total_thb = entries.reduce((sum, e) => sum + (Number(e.thb) || 0), 0);
  
  // Weighted Avg Rate (Only relevant for FX In entries arguably, but keeping existing logic 
  // which filters by presence of rate/usd)
  let totalUsdForRate = 0;
  let weightedRateSum = 0;
  
  entries.forEach(entry => {
    // Typically only FX has rate, but we check existence
    if (entry.rate && entry.usd && Number(entry.rate) > 0) {
      const usd = Number(entry.usd);
      const rate = Number(entry.rate);
      totalUsdForRate += usd;
      weightedRateSum += usd * rate;
    }
  });
  
  const weighted_avg_rate = totalUsdForRate > 0 ? weightedRateSum / totalUsdForRate : 0;
  
  // Derived total values (Legacy)
  const total_value_thb = total_thb + (cash_remain * weighted_avg_rate);
  
  return {
    total_in,
    total_out,
    cash_remain,
    gold_profit,
    interest_income,
    
    // Mapped legacy fields
    total_usd: cash_remain, // Mapping total_usd to cash_remain for backward comp if needed
    total_thb,
    weighted_avg_rate,
    total_value_thb, // updated to use cash_remain instead of total_usd
    total_value_usd: cash_remain + (weighted_avg_rate > 0 ? total_thb / weighted_avg_rate : 0),
    total_entries: entries.length,
    active_entries: entries.filter(e => e.status === 'IN' || e.status === 'Interest').length,
  };
}

export function formatCurrency(amount: number, currency: 'USD' | 'THB' = 'THB'): string {
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
  
  return new Intl.NumberFormat('th-TH', {
    style: 'currency',
    currency: 'THB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
