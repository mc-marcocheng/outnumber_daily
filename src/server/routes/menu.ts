import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit, redis } from '@devvit/web/server';
import { createDailyPost } from '../core/post';
import { purgeUser } from '../storage';
import { z } from 'zod';
import { isCommunityModerator } from '../moderator';
import { deleteCommunityRanking } from '../community-ranking';
import { deleteSubmissions } from '../community-submissions';

export const menu = new Hono();
const hubTitle = 'Outnumber: Daily Numbers Puzzle';

menu.post('/hub-create', async (c) => {
  if (!(await isCommunityModerator()))
    return c.json<UiResponse>({ showToast: 'Moderator access required' }, 403);
  const lock = await redis.set('community-hub-create-lock', '1', {
    nx: true,
    expiration: new Date(Date.now() + 60_000),
  });
  if (!lock)
    return c.json<UiResponse>(
      { showToast: 'Hub creation is already in progress. Retry in a minute.' },
      409
    );
  try {
    const existing = await redis.get('community-hub-post');
    const previous = existing
      ? await reddit.getPostById(
          z.templateLiteral(['t3_', z.string()]).parse(existing)
        )
      : null;
    const post =
      previous?.title === hubTitle
        ? previous
        : await reddit.submitCustomPost({
            title: hubTitle,
            entry: 'hub',
            postData: { kind: 'community-hub' },
          });
    await post.setCustomPostStyles({ heightPixels: 256 });
    await post.highlight({ highlightLabelType: 'MEGATHREAD' });
    if (previous && previous.id !== post.id) await previous.unhighlight();
    await redis.set('community-hub-post', post.id);
    return c.json<UiResponse>({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error('hub-create failed', error);
    return c.json<UiResponse>(
      { showToast: 'Could not create or highlight the hub. Please retry.' },
      500
    );
  } finally {
    await redis.del('community-hub-create-lock');
  }
});

menu.post('/post-create-dated', async (c) => {
  if (!(await isCommunityModerator()))
    return c.json<UiResponse>({ showToast: 'Moderator access required' }, 403);
  return c.json<UiResponse>({
    showForm: {
      name: 'createDatedPost',
      form: {
        title: 'Create a dated Outnumber post',
        acceptLabel: 'Create puzzle post',
        fields: [
          {
            name: 'date',
            label: 'Puzzle date (YYYY-MM-DD)',
            type: 'string',
            required: true,
          },
        ],
      },
    },
  });
});

menu.post('/post-create-dated-confirm', async (c) => {
  const request = z
    .object({ date: z.iso.date() })
    .safeParse(await c.req.json());
  if (!request.success)
    return c.json<UiResponse>(
      { showToast: 'Enter a valid date in YYYY-MM-DD format' },
      400
    );
  if (!(await isCommunityModerator()))
    return c.json<UiResponse>({ showToast: 'Moderator access required' }, 403);
  try {
    const post = await createDailyPost(request.data.date);
    return c.json<UiResponse>({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error('post-create-dated failed', error);
    return c.json<UiResponse>(
      { showToast: 'Failed to create dated post' },
      500
    );
  }
});

menu.post('/delete-my-data', async (c) => {
  if (!context.userId) {
    return c.json<UiResponse>(
      { showToast: 'Log in to delete your Outnumber data' },
      401
    );
  }
  return c.json<UiResponse>({
    showForm: {
      name: 'deleteMyData',
      form: {
        title: 'Delete my Outnumber data',
        description:
          'Delete your saved runs, scores, profile and streaks in this community. Close Outnumber in other tabs first: an open game can save data again after deletion. Playing again also creates new data.',
        acceptLabel: 'Delete my data',
        fields: [
          {
            name: 'confirm',
            label: 'Permanently delete my Outnumber data',
            type: 'boolean',
            defaultValue: false,
          },
        ],
      },
    },
  });
});

menu.post('/delete-my-data-confirm', async (c) => {
  if (!context.userId) {
    return c.json<UiResponse>(
      { showToast: 'Log in to delete your Outnumber data' },
      401
    );
  }
  const request = z
    .object({ confirm: z.literal(true) })
    .safeParse(await c.req.json());
  if (!request.success)
    return c.json<UiResponse>({ showToast: 'Deletion cancelled' });
  try {
    await deleteCommunityRanking(context.userId);
    await deleteSubmissions(context.userId);
    await purgeUser(context.userId);
    return c.json<UiResponse>({
      showToast: 'Your Outnumber data has been deleted',
    });
  } catch (error) {
    console.error('delete-my-data failed', error);
    return c.json<UiResponse>(
      {
        showToast:
          'Could not delete data. Please retry or contact the moderators.',
      },
      500
    );
  }
});

menu.post('/post-create', async (c) => {
  try {
    const post = await createDailyPost();
    return c.json<UiResponse>({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error('post-create failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});
