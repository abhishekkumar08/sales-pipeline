const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-IN');

export const inr = (v: number): string => `₹${compact.format(v)}`;
export const num = (v: number): string => full.format(v);
