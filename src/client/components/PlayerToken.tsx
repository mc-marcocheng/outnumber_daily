import { useState } from 'react';
import { NumberLabel } from './NumberLabel';

type Props = {
  avatarUrl: string | null;
  value: bigint;
};

export function PlayerToken({ avatarUrl, value }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!avatarUrl || failedUrl === avatarUrl)
    return <NumberLabel value={value} />;
  return (
    <>
      <img
        className="player-avatar"
        src={avatarUrl}
        alt=""
        onError={() => setFailedUrl(avatarUrl)}
      />
      <span className="player-value number">{value.toString()}</span>
    </>
  );
}
