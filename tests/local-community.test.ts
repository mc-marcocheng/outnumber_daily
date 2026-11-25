import { afterEach, describe, expect, it, vi } from 'vitest';
import * as assessmentModule from '../src/shared/contribution-assessment';
import { createLocalCommunity } from '../tools/local-community';
import { newDraft } from '../src/client/app/puzzle-editor';

describe('local community preview', () => {
  afterEach(() => vi.restoreAllMocks());
  it('assesses a puzzle without reducing operations but rejects it below daily criteria', () => {
    const community = createLocalCommunity();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const input = {
      difficulty: 'easy',
      level: {
        ...newDraft(),
        tiles: [{ id: 'boss', kind: 'boss', cell: 3, value: '3' }],
      },
      actions: ['boss'],
    };
    const result = community.handle(
      new URL('/api/community/assess', 'http://localhost'),
      'POST',
      input
    );
    expect(result).toEqual({
      status: 200,
      body: {
        steps: 3,
        assessment: {
          status: 'assessed',
          difficulty: null,
          minimumActions: 1,
          meaningfulForks: 0,
        },
      },
    });
    now.mockReturnValue(1_030_000);
    expect(
      community.handle(
        new URL('/api/community/submit', 'http://localhost'),
        'POST',
        input
      )
    ).toMatchObject({
      status: 400,
      body: { message: expect.stringContaining('below daily criteria') },
    });
  });
  it('supports assessment, private submission, shortlisting and withdrawal', () => {
    const community = createLocalCommunity();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const request = (path: string, method = 'GET', input: unknown = null) =>
      community.handle(
        new URL(`/api/community${path}`, 'http://localhost'),
        method,
        input
      );
    const input = {
      difficulty: 'easy',
      level: newDraft(),
      actions: ['tile-1', 'tile-2', 'tile-3'],
    };
    expect(request('/assess', 'POST', input)).toMatchObject({
      status: 200,
      body: {
        steps: 3,
        assessment: {
          status: 'assessed',
          difficulty: null,
        },
      },
    });
    vi.spyOn(assessmentModule, 'assessContribution').mockReturnValue({
      status: 'assessed',
      difficulty: 'easy',
      minimumActions: 5,
      meaningfulForks: 2,
    });
    now.mockReturnValue(1_030_000);
    const result = request('/submit', 'POST', input);
    expect(result.status).toBe(200);
    const body = JSON.stringify(result.body);
    const id: string = JSON.parse(body).submission.id;
    now.mockReturnValue(1_060_000);
    expect(request('/submit', 'POST', input).status).toBe(200);
    expect(request('/submissions').body).toMatchObject({
      submissions: [expect.objectContaining({ id })],
    });
    expect(
      request('/review', 'POST', {
        authorId: 't2_local',
        id,
        status: 'accepted',
      }).status
    ).toBe(200);
    expect(request('/review?status=accepted').body).toMatchObject({
      submissions: [expect.objectContaining({ status: 'accepted' })],
    });
    request('/withdraw', 'POST', { id });
    expect(request('/submissions').body).toEqual({ submissions: [] });
  });
  it('requires rejection reasons, lists rejected submissions and clears reasons on reacceptance', () => {
    const community = createLocalCommunity();
    const request = (path: string, method = 'GET', input: unknown = null) =>
      community.handle(
        new URL(`/api/community${path}`, 'http://localhost'),
        method,
        input
      );
    vi.spyOn(assessmentModule, 'assessContribution').mockReturnValue({
      status: 'assessed',
      difficulty: 'easy',
      minimumActions: 5,
      meaningfulForks: 2,
    });
    const result = request('/submit', 'POST', {
      difficulty: 'easy',
      level: newDraft(),
      actions: ['tile-1', 'tile-2', 'tile-3'],
    });
    expect(result.status).toBe(200);
    const id: string = JSON.parse(JSON.stringify(result.body)).submission.id;
    const review = { authorId: 't2_local', id, status: 'rejected' };
    for (const declineReason of [
      undefined,
      null,
      123,
      '',
      ' \n ',
      'a'.repeat(501),
    ])
      expect(
        request('/review', 'POST', { ...review, declineReason }).status
      ).toBe(400);
    expect(request('/review').body).toMatchObject({
      submissions: [{ id, status: 'submitted' }],
    });
    expect(
      request('/review', 'POST', {
        ...review,
        declineReason: ` ${'a'.repeat(500)} `,
      }).status
    ).toBe(200);
    expect(request('/review?status=rejected').body).toMatchObject({
      submissions: [{ id, declineReason: 'a'.repeat(500) }],
    });
    expect(request('/submissions').body).toMatchObject({
      submissions: [{ declineReason: 'a'.repeat(500) }],
    });
    expect(request('/review?status=unknown').status).toBe(400);
    expect(
      request('/review', 'POST', {
        ...review,
        status: 'accepted',
        declineReason: 'Stale reason.',
      }).status
    ).toBe(200);
    expect(request('/review?status=rejected').body).toEqual({
      submissions: [],
    });
    expect(
      JSON.stringify(request('/review?status=accepted').body)
    ).not.toContain('declineReason');
    request('/review', 'POST', { ...review, declineReason: 'Revise choices.' });
    request('/withdraw', 'POST', { id });
    expect(request('/review?status=rejected').body).toEqual({
      submissions: [],
    });
    expect(request('/submissions').body).toEqual({ submissions: [] });
  });
  it('shares the 30-second cooldown between assessment and submission without extending it', () => {
    const community = createLocalCommunity();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const request = (path: string, input: unknown) =>
      community.handle(
        new URL(`/api/community${path}`, 'http://localhost'),
        'POST',
        input
      );
    const input = {
      difficulty: 'easy',
      level: newDraft(),
      actions: ['tile-1', 'tile-2', 'tile-3'],
    };
    expect(request('/assess', { ...input, actions: [] }).status).toBe(400);
    expect(request('/assess', input).status).toBe(200);
    now.mockReturnValue(1_029_999);
    for (const path of ['/assess', '/submit'])
      expect(request(path, input)).toEqual({
        status: 429,
        body: {
          message:
            'Wait 30 seconds before requesting another assessment or submission.',
          retryAfterSeconds: 30,
        },
      });
    now.mockReturnValue(1_030_000);
    expect(request('/submit', input).status).toBe(400);
    expect(request('/assess', input)).toMatchObject({
      status: 429,
      body: { retryAfterSeconds: 30 },
    });
    now.mockReturnValue(1_060_000);
    expect(request('/assess', input).status).toBe(200);
  });
});
