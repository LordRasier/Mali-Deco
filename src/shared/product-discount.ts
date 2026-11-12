/** Floor the percentage so a ribbon never promises more than the actual saving. */
export function discountPercentage(regular: number, payable: number): string | undefined {
  if (!Number.isSafeInteger(regular) || !Number.isSafeInteger(payable) || payable < 0 || regular <= payable) return undefined;
  const percent = (BigInt(regular) - BigInt(payable)) * 100n / BigInt(regular);
  return percent === 0n ? '<1' : String(percent);
}
