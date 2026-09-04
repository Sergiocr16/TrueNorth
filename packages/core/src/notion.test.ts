import { describe, expect, it } from 'vitest';
import { notionUrl } from './notion';
import * as fixtures from './fixtures';

describe('notionUrl', () => {
  it('builds a link from a bare 32-character id', () => {
    expect(notionUrl('3acddbac34cb81e6b4c0ea280b95217b')).toBe(
      'https://www.notion.so/3acddbac34cb81e6b4c0ea280b95217b',
    );
  });

  it('accepts the dashed form Notion also hands out', () => {
    expect(notionUrl('3acddbac-34cb-81e6-b4c0-ea280b95217b')).toBe(
      'https://www.notion.so/3acddbac34cb81e6b4c0ea280b95217b',
    );
  });

  it('is case-insensitive', () => {
    expect(notionUrl('3ACDDBAC34CB81E6B4C0EA280B95217B')).toBe(
      'https://www.notion.so/3acddbac34cb81e6b4c0ea280b95217b',
    );
  });

  // A task created in the app has no page, and half a link is worse than none.
  it('returns null when there is no id', () => {
    expect(notionUrl(undefined)).toBeNull();
    expect(notionUrl(null)).toBeNull();
    expect(notionUrl('')).toBeNull();
  });

  it('refuses anything that is not a page id', () => {
    expect(notionUrl('not-an-id')).toBeNull();
    expect(notionUrl('3acddbac34cb81e6b4c0ea280b95217')).toBeNull();
    expect(notionUrl('3acddbac34cb81e6b4c0ea280b95217bb')).toBeNull();
  });

  it('links every task ADITUM synced from Notion', () => {
    const synced = fixtures.tasks.filter((task) => task.notionPageId);
    expect(synced.length).toBeGreaterThan(0);
    for (const task of synced) {
      expect(notionUrl(task.notionPageId)).toMatch(/^https:\/\/www\.notion\.so\/[0-9a-f]{32}$/);
    }
  });
});
