import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { createDailyPost } from '../core/post';
import { reddit, redis } from '@devvit/web/server';
import { z } from 'zod';
import { getPostDate, purgeDay } from '../storage';
import { deleteCommunityDay } from '../community-ranking';

const postDeleteSchema = z.object({
  postId: z.templateLiteral(['t3_', z.string().regex(/^[a-z0-9]+$/)]),
});
const dateSchema = z.iso.date();

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createDailyPost();
    return c.json<TriggerResponse>({
      status: 'success',
      message: `Daily post created: ${post.id}`,
    });
  } catch (error) {
    console.error('on-app-install failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create daily post' },
      400
    );
  }
});

triggers.post('/on-post-delete', async (c) => {
  const request = postDeleteSchema.safeParse(await c.req.json());
  if (!request.success) {
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Invalid post deletion request' },
      400
    );
  }
  try {
    const postId = request.data.postId;
    if ((await redis.get('community-hub-post')) === postId) {
      await redis.del('community-hub-post');
      return c.json<TriggerResponse>({
        status: 'success',
        message: 'Community hub link deleted',
      });
    }
    let date = await getPostDate(postId);
    if (!date) {
      const post = await reddit.getPostById(postId);
      const data = await post.getPostData();
      const parsed = dateSchema.safeParse(data?.date);
      if (parsed.success) date = parsed.data;
    }
    if (date) {
      const parsed = dateSchema.parse(date);
      await deleteCommunityDay(parsed);
      await purgeDay(parsed);
      await redis.del(`post-date:${postId}`);
    }
    return c.json<TriggerResponse>({
      status: 'success',
      message: date ? 'Day data deleted' : 'No Outnumber day data',
    });
  } catch (error) {
    console.error('on-post-delete failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to delete day data' },
      500
    );
  }
});

triggers.post('/on-comment-delete', async (c) => {
  // Outnumber does not store comment bodies, authors, or comment-linked game data.
  return c.json<TriggerResponse>({
    status: 'success',
    message: 'No comment data stored',
  });
});
