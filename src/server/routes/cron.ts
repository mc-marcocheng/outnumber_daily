import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { createDailyPost } from '../core/post';

export const cron = new Hono();

cron.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();
    console.log(`daily-post created ${post.id}`);
    return c.json<TaskResponse>({});
  } catch (error) {
    console.error('daily-post failed', error);
    return c.json<TaskResponse>({}, 500);
  }
});
