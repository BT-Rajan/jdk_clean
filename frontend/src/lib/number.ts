/** Every numeric field in the app is a quantity, price, or percentage --
 * none of them are ever meant to go negative. Controlled number inputs
 * that aren't already wired through a zod-validated react-hook-form (see
 * lib/validation/*.ts for those) should clamp through this on every
 * change, so a negative value is never even reachable in state, not just
 * rejected later by the backend's 422.
 *
 * An HTML `min="0"` attribute alone isn't enough -- it only affects the
 * spinner arrows and native validity styling, a user can still type "-5"
 * directly into the field. This is the actual guarantee.
 */
export function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Same guarantee as clampNonNegative, for the number inputs whose state
 * is kept as a raw string (so an empty field can exist mid-edit instead
 * of collapsing to 0) -- clamps only once there's an actual value typed,
 * leaves '' alone so the field can still be cleared out. */
export function clampNonNegativeString(value: string): string {
  if (value === '') return value
  return String(clampNonNegative(Number(value)))
}
