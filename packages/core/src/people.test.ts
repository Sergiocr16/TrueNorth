import { describe, expect, it } from 'vitest';
import { matchPerson } from './people';

const team = [
  { id: 'u_marco', displayName: 'Marco Jiménez' },
  { id: 'u_adriana', displayName: 'Adriana Vargas', notionUserId: 'notion-adriana' },
  { id: 'u_lucia', displayName: 'Lucía Mora' },
];

describe('matchPerson', () => {
  it('matches the same full name regardless of accents and case', () => {
    expect(matchPerson({ name: 'marco jimenez' }, team)?.id).toBe('u_marco');
    expect(matchPerson({ name: 'LUCIA MORA' }, team)?.id).toBe('u_lucia');
  });

  it('matches a first name alone when only one person carries it', () => {
    expect(matchPerson({ name: 'Marco' }, team)?.id).toBe('u_marco');
  });

  it('matches a longer Notion name that contains the team name', () => {
    expect(matchPerson({ name: 'Marco Jiménez Rojas' }, team)?.id).toBe('u_marco');
  });

  it('prefers a stored Notion user id over the name', () => {
    expect(
      matchPerson({ name: 'A. Vargas', notionUserId: 'notion-adriana' }, team)?.id,
    ).toBe('u_adriana');
  });

  // Guessing wrong hands somebody else's work to the wrong person, which is
  // worse than leaving the task unassigned and letting the signal say so.
  it('refuses to guess between two people who both fit', () => {
    const twoMarcos = [...team, { id: 'u_marco2', displayName: 'Marco Solano' }];
    expect(matchPerson({ name: 'Marco' }, twoMarcos)).toBeNull();
    expect(matchPerson({ name: 'Marco Solano' }, twoMarcos)?.id).toBe('u_marco2');
  });

  it('returns null for somebody not on the team', () => {
    expect(matchPerson({ name: 'Daniela Castro' }, team)).toBeNull();
    expect(matchPerson({ name: '' }, team)).toBeNull();
  });
});
