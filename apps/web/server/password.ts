import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * The one-time password a new account is handed with.
 *
 * It is read off a screen and typed on a phone, often dictated over a call, so
 * the alphabet leaves out every pair that gets confused out loud or in a
 * sans-serif font: O and 0, I and l and 1, and the letters that only differ by
 * case once somebody's keyboard capitalises the first character. What is left
 * is 32 symbols; twelve of them is 60 bits, which is far past anything that
 * gets guessed before the person changes it.
 *
 * Grouped in threes because a person reading it aloud pauses there anyway, and
 * the dashes are part of the password — they are typed too.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function temporaryPassword(): string {
  const groups = [0, 1, 2].map(() =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  );
  return groups.join('-');
}
