import { redis } from '@devvit/web/server';
import { createHash } from 'node:crypto';
import type {
  CommunitySubmission,
  ContributionAssessment,
} from '../shared/contributions';
import {
  declineReasonSchema,
  validateContribution,
} from '../shared/contributions';

const prefix = 'community-submissions';
const queueKey = `${prefix}:queue`;
const shortlistKey = `${prefix}:shortlist`;
const rejectedKey = `${prefix}:rejected`;

export async function saveSubmission(
  authorId: string,
  author: string,
  input: ReturnType<typeof validateContribution>,
  assessment: ContributionAssessment
): Promise<CommunitySubmission> {
  const { steps, ...content } = input;
  const id = createHash('sha256')
    .update(JSON.stringify(content))
    .digest('hex')
    .slice(0, 32);
  const key = `${prefix}:author:${authorId}`;
  const transaction = await redis.watch(key);
  try {
    const entries = (await redis.hGetAll(key)) ?? {};
    const existing = entries[id];
    if (existing) {
      await transaction.discard();
      return JSON.parse(existing);
    }
    if (Object.keys(entries).length >= 10)
      throw new Error(
        'You can keep up to 10 submissions. Withdraw one before submitting another.'
      );
    const submission: CommunitySubmission = {
      ...content,
      id,
      authorId,
      author,
      steps,
      assessment,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    };
    await transaction.multi();
    await transaction.hSet(key, { [id]: JSON.stringify(submission) });
    await transaction.zAdd(queueKey, {
      member: `${authorId}:${id}`,
      score: Date.now(),
    });
    if ((await transaction.exec()) === null)
      throw new Error('Submission changed. Please retry.');
    return submission;
  } catch (error) {
    await transaction.discard();
    throw error;
  }
}

export async function listSubmissions(
  authorId: string
): Promise<CommunitySubmission[]> {
  return Object.values(
    (await redis.hGetAll(`${prefix}:author:${authorId}`)) ?? {}
  ).map((raw) => JSON.parse(raw));
}

export async function listReviewQueue(
  status: CommunitySubmission['status'] = 'submitted'
): Promise<CommunitySubmission[]> {
  const entries = await redis.zRange(
    status === 'accepted'
      ? shortlistKey
      : status === 'rejected'
        ? rejectedKey
        : queueKey,
    0,
    49,
    { by: 'rank' }
  );
  const result: CommunitySubmission[] = [];
  for (const entry of entries) {
    const [authorId, id] = entry.member.split(':');
    if (!authorId || !id) continue;
    const raw = await redis.hGet(`${prefix}:author:${authorId}`, id);
    if (raw) result.push(JSON.parse(raw));
  }
  return result;
}

export async function updateSubmission(
  authorId: string,
  id: string,
  status: 'accepted' | 'rejected' | 'withdraw',
  declineReason?: string
): Promise<void> {
  const reason =
    status === 'rejected'
      ? declineReasonSchema.parse(declineReason)
      : undefined;
  const key = `${prefix}:author:${authorId}`;
  const transaction = await redis.watch(key);
  try {
    const raw = await redis.hGet(key, id);
    if (!raw) throw new Error('Submission not found.');
    const submission: CommunitySubmission = JSON.parse(raw);
    delete submission.declineReason;
    if (reason !== undefined) submission.declineReason = reason;
    await transaction.multi();
    if (status === 'withdraw') await transaction.hDel(key, [id]);
    else
      await transaction.hSet(key, {
        [id]: JSON.stringify({ ...submission, status }),
      });
    await transaction.zRem(queueKey, [`${authorId}:${id}`]);
    await transaction.zRem(shortlistKey, [`${authorId}:${id}`]);
    await transaction.zRem(rejectedKey, [`${authorId}:${id}`]);
    if (status === 'accepted' || status === 'rejected')
      await transaction.zAdd(
        status === 'accepted' ? shortlistKey : rejectedKey,
        {
          member: `${authorId}:${id}`,
          score: Date.now(),
        }
      );
    if ((await transaction.exec()) === null)
      throw new Error('Submission changed. Please retry.');
  } catch (error) {
    await transaction.discard();
    throw error;
  }
}

export async function deleteSubmissions(authorId: string): Promise<void> {
  for (const submission of await listSubmissions(authorId))
    await updateSubmission(authorId, submission.id, 'withdraw');
  await redis.del(`${prefix}:author:${authorId}`, `${prefix}:rate:${authorId}`);
}
