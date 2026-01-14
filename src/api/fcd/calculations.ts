import type { FCDEntry, FCDStats } from './types';

export function calculateFCDStats(entries: FCDEntry[]): FCDStats {
  // Calculate from ALL entries regardless of status
  const total_usd = entries.reduce((sum, e) => sum + Number(e.usd), 0);
  const total_thb = entries.reduce((sum, e) => sum + (Number(e.thb) || 0), 0);
  
  // Calculate weighted average rate
  let totalUsdForRate = 0;
  let weightedRateSum = 0;
  
  entries.forEach(entry => {
    if (entry.rate && entry.usd) {
      const usd = Number(entry.usd);
      const rate = Number(entry.rate);
      totalUsdForRate += usd;
      weightedRateSum += usd * rate;
    }
  });
  
  const weighted_avg_rate = totalUsdForRate > 0 ? weightedRateSum / totalUsdForRate : 0;
  
  // Calculate total values
  const total_value_thb = total_thb + (total_usd * weighted_avg_rate);
  const total_value_usd = total_usd + (weighted_avg_rate > 0 ? total_thb / weighted_avg_rate : 0);
  
  // Count by status
  const inCount = entries.filter(e => e.status === 'IN').length;
  const interestCount = entries.filter(e => e.status === 'Interest').length;
//   const outCount = entries.filter(e => e.status === 'Out').length;
  
  return {
    total_usd,
    total_thb,
    weighted_avg_rate,
    total_value_thb,
    total_value_usd,
    total_entries: entries.length,
    active_entries: inCount + interestCount, // IN + Interest
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
