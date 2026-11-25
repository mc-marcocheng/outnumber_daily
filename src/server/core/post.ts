import { reddit } from '@devvit/web/server';
import { getDaily, utcDate } from '../daily';
import { rememberPostDate } from '../storage';

export async function createDailyPost(date: string = utcDate()) {
  getDaily(date);
  const post = await reddit.submitCustomPost({
    title: `Outnumber Daily: ${date}`,
    postData: { date },
  });
  await rememberPostDate(post.id, date);
  return post;
}
