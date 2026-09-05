/**
 * Who may create a company from scratch and hand out accounts.
 *
 * Mirrors `founders()` in firestore.rules, which is what actually enforces
 * the first; the server's invite route enforces the second with this list.
 * Keep it short, and change both places together.
 */
export const FOUNDERS: readonly string[] = ['sergio@aditumcr.com'];

export function isFounder(email: string | null | undefined): boolean {
  return Boolean(email) && FOUNDERS.includes((email as string).toLowerCase());
}
