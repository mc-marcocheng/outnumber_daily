import { useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ShareResultResponse } from '../../shared/api';
import { postJson } from '../api';
import '../styles/share-result.css';
import type { Difficulty } from '../../shared/season';

export function ShareResult({
  date,
  steps,
  onCancel,
  difficulty = 'easy',
}: {
  date: string;
  steps: number;
  onCancel: () => void;
  difficulty?: Difficulty;
}) {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<{ requestId: string; message: string } | null>(null);

  if (posted) return <p role="status">{t('ui.commentPosted')}</p>;

  return (
    <form
      className="share-result"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending || !message.trim()) return;
        request.current ??= {
          requestId: crypto.randomUUID(),
          message: message.trim(),
        };
        setPending(true);
        setFailed(false);
        try {
          await postJson<ShareResultResponse>('/api/share-result', {
            ...request.current,
            date,
            difficulty,
          });
          setPosted(true);
        } catch {
          setFailed(true);
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor="result-comment">{t('ui.yourComment')}</label>
      <textarea
        id="result-comment"
        placeholder={t('ui.commentPlaceholder')}
        value={message}
        maxLength={2000}
        required
        disabled={pending || failed}
        onChange={(event) => setMessage(event.currentTarget.value)}
      />
      <small className="share-result__score">
        Outnumber Daily · {date} · {t(`difficulty.${difficulty}`)} ·{' '}
        {t('ui.commentSteps', { steps })}
      </small>
      {failed && <p role="alert">{t('ui.commentUnconfirmed')}</p>}
      <div className="share-result__actions">
        <button
          type="button"
          className="toolbar-button"
          disabled={pending}
          onClick={onCancel}
        >
          <X />
          <span>{t('ui.cancelComment')}</span>
        </button>
        <button
          type="submit"
          className="toolbar-button action-highlight"
          disabled={pending || !message.trim()}
        >
          <Send />
          <span>
            {t(
              pending
                ? 'ui.postingComment'
                : failed
                  ? 'ui.checkComment'
                  : 'ui.postComment'
            )}
          </span>
        </button>
      </div>
    </form>
  );
}
