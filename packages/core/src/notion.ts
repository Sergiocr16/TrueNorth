/**
 * Linking back to Notion.
 *
 * A task that came from Notion is still a Notion task: people talk about it
 * there, comment on it there, and move it there. So wherever the app shows one,
 * it has to be one click from the page it mirrors.
 */

/** A Notion page id: 32 hex characters, dashed or not. */
const PAGE_ID = /^[0-9a-f]{32}$/;

/**
 * The URL of a Notion page, or null when the id is missing or malformed.
 *
 * Notion accepts the id with or without dashes; the dashless form is what its
 * own links use, so that is what we build. Returning null rather than a broken
 * link matters: a task created in the app has no Notion page, and the caller
 * decides whether to show the link at all.
 */
export function notionUrl(pageId: string | null | undefined): string | null {
  if (!pageId) return null;
  const bare = pageId.replace(/-/g, '').toLowerCase();
  return PAGE_ID.test(bare) ? `https://www.notion.so/${bare}` : null;
}
