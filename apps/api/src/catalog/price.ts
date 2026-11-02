export function assertMinorUnits(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Price must be a nonnegative safe integer in minor units');
  }
}
