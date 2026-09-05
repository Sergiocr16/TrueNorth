import type { Membership, User } from './types';

/**
 * Who a Notion person is, on the team.
 *
 * Notion already knows who is responsible for every task; the app does not get
 * to decide that. What the app decides is which team member that Notion person
 * *is*, and Sergio's rule for that is the name: the team is the people who show
 * up as responsible in Notion, matched by how they are called. A stored Notion
 * user id wins when there is one, because names change and ids do not, but
 * nobody has to fill it in for the match to work.
 */

export interface KnownPerson {
  id: string;
  displayName: string;
  notionUserId?: string;
  /** Further Notion identities of the same person; see `Membership.notionUserIds`. */
  notionUserIds?: string[];
}

/** Every Notion id a known person answers to. */
export function notionIdsOf(person: Pick<KnownPerson, 'notionUserId' | 'notionUserIds'>): string[] {
  return [...new Set([person.notionUserId, ...(person.notionUserIds ?? [])].filter((id): id is string => Boolean(id)))];
}

/** Accents, case, spacing and honorifics out; the tokens that name somebody in. */
function tokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * The team member a Notion person corresponds to, or null.
 *
 * In order: an exact Notion user id; the same full name; then a name that is
 * a subset of the other — "Marco" matches "Marco Jiménez", and "Marco Jiménez
 * Rojas" matches "Marco Jiménez" — as long as exactly one person fits. Two
 * Marcos on the team and a bare "Marco" is nobody: guessing wrong assigns
 * somebody else's work, which is worse than leaving it unassigned.
 */
export function matchPerson(
  notion: { name: string; notionUserId?: string | null },
  people: KnownPerson[],
): KnownPerson | null {
  if (notion.notionUserId) {
    const byId = people.find((p) => notionIdsOf(p).includes(notion.notionUserId as string));
    if (byId) return byId;
  }

  const wanted = tokens(notion.name);
  if (wanted.length === 0) return null;

  const exact = people.filter((p) => tokens(p.displayName).join(' ') === wanted.join(' '));
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  const overlaps = people.filter((p) => {
    const have = tokens(p.displayName);
    const shorter = have.length <= wanted.length ? have : wanted;
    const longer = shorter === have ? wanted : have;
    return shorter.every((t) => longer.includes(t));
  });
  return overlaps.length === 1 ? overlaps[0]! : null;
}

/** The team as the matcher sees it, from what the store already holds. */
export function knownPeople(users: User[], memberships: Membership[]): KnownPerson[] {
  return users.map((u) => {
    const membership = memberships.find((m) => m.userId === u.id);
    return {
      id: u.id,
      displayName: u.displayName,
      notionUserId: membership?.notionUserId,
      notionUserIds: membership?.notionUserIds,
    };
  });
}
