import { context, reddit } from '@devvit/web/server';

export async function isCommunityModerator(): Promise<boolean> {
  if (!context.userId) return false;
  const username = await reddit.getCurrentUsername();
  if (!username) return false;
  const moderators = await reddit
    .getModerators({ subredditName: context.subredditName, username })
    .all();
  return moderators.some((moderator) => moderator.id === context.userId);
}
