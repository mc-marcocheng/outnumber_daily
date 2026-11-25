import { z } from 'zod';

export class CommunityRequestError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export async function communityRequest<Result>(
  path: string,
  body?: unknown
): Promise<Result> {
  const response = await fetch(
    `/api/community${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
  );
  if (!response.ok) {
    const error = z
      .object({
        message: z.string(),
        retryAfterSeconds: z.number().int().positive().optional(),
      })
      .safeParse(await response.json().catch(() => null));
    throw new CommunityRequestError(
      error.success ? error.data.message : 'Request failed. Please retry.',
      error.success ? error.data.retryAfterSeconds : undefined
    );
  }
  return response.json();
}
