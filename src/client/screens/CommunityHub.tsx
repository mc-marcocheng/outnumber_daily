import { useEffect, useRef, useState } from 'react';
import {
  exitExpandedMode,
  getWebViewMode,
  requestExpandedMode,
} from '@devvit/web/client';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCopy,
  Maximize2,
  Hammer,
  Minimize2,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Trash2,
  Trophy,
  Undo2,
  Video,
  X,
} from 'lucide-react';
import { z } from 'zod';
import type { CommunityRank } from '../../shared/community-ranking';
import type { CommunitySubmission } from '../../shared/contributions';
import { compileLevel } from '../../shared/game/level-schema';
import {
  commitInteraction,
  createSession,
  restoreSession,
  undo,
} from '../../shared/game/session';
import { communityRequest } from '../app/community-api';
import { SplashBoard } from '../components/SplashBoard';
import { Assessment, PuzzleBuilder } from '../components/PuzzleBuilder';
import { GameBoard } from '../components/GameBoard';
import { AppDialog } from '../components/AppDialog';
import { GameSettings } from '../components/GameSettings';
import { AppAppearance } from '../app/AppAppearance';
import { displayPreferencesSchema } from '../app/theme-palettes';
import { RoutePlayback } from '../tutorials/RoutePlayback';
import { guidedLevel, guidedActions } from '../tutorials/lessons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

function isExpanded(): boolean {
  try {
    return getWebViewMode() === 'expanded';
  } catch {
    return false;
  }
}

type HubInit = {
  signedIn: boolean;
  moderator: boolean;
  rankingStartDate: string;
};

function duration(milliseconds: number, t: TFunction): string {
  const seconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return t('{{days}}d {{hours}}h {{minutes}}m {{seconds}}s', {
    days,
    hours,
    minutes,
    seconds: seconds % 60,
  });
}

function CommunityLeaderboard() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'all' | 'today'>('all');
  const [difficulty, setDifficulty] = useState('all');
  const [rows, setRows] = useState<CommunityRank[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void communityRequest<{ rows: CommunityRank[] }>(
      `/leaderboard?period=${period}&difficulty=${difficulty}`
    )
      .then((result) => {
        if (!cancelled) {
          setRows(result.rows);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load rankings.'
          );
      });
    return () => {
      cancelled = true;
    };
  }, [period, difficulty, revision]);
  return (
    <section className="hub-rankings">
      <div className="hub-section-heading">
        <h2>{t('Leaderboard')}</h2>
        <button
          type="button"
          aria-label={t('Refresh leaderboard')}
          title={t('Refresh leaderboard')}
          onClick={() => {
            setRows(null);
            setRevision(revision + 1);
          }}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <div className="hub-filters">
        <div
          className="hub-segmented"
          role="radiogroup"
          aria-label={t('Leaderboard period')}
        >
          {(['all', 'today'] satisfies ('all' | 'today')[]).map((value) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={period === value}
              onClick={() => {
                setPeriod(value);
                setRows(null);
                setError('');
              }}
            >
              {t(value === 'all' ? 'All time' : 'Today')}
            </button>
          ))}
        </div>
        <div
          className="hub-segmented"
          role="radiogroup"
          aria-label={t('Level')}
        >
          {['all', 'easy', 'medium', 'hard'].map((value) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={difficulty === value}
              onClick={() => {
                setDifficulty(value);
                setRows(null);
                setError('');
              }}
            >
              {t(value === 'all' ? 'All levels' : `difficulty.${value}`)}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p role="alert">
          {t(error, { defaultValue: t('Could not load rankings.') })}
        </p>
      ) : rows === null ? (
        <p role="status">{t('Loading rankings...')}</p>
      ) : rows.length === 0 ? (
        <p className="hub-empty">{t('No ranked solves yet.')}</p>
      ) : (
        <div className="hub-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('Rank')}</th>
                <th scope="col">{t('Player')}</th>
                <th scope="col">{t('Solved')}</th>
                <th scope="col">{t('Steps')}</th>
                <th scope="col">{t('Release to solve')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td>{row.rank}</td>
                  <th scope="row">{row.username}</th>
                  <td>{row.solved}</td>
                  <td>{row.steps}</td>
                  <td>{duration(row.elapsedMs, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SubmissionPreview({
  submission,
}: {
  submission: CommunitySubmission;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSession, setTestSession] = useState(() =>
    createSession(compileLevel(submission.level))
  );
  const [testError, setTestError] = useState('');
  const level = compileLevel(submission.level);
  const session = testing
    ? testSession
    : restoreSession(level, submission.actions.slice(0, step));
  return (
    <div className="submission-preview">
      <div
        className="hub-segmented"
        role="radiogroup"
        aria-label={t('Puzzle inspection')}
      >
        <button
          type="button"
          role="radio"
          aria-checked={!testing}
          onClick={() => setTesting(false)}
        >
          <BookOpen size={16} />
          {t('Solution')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={testing}
          onClick={() => {
            setTesting(true);
            setTestError('');
          }}
        >
          <Play size={16} />
          {t('Test')}
        </button>
      </div>
      <div className="submission-board">
        <GameBoard
          level={level}
          state={session.present}
          selectedId={null}
          path={null}
          cellSize={Math.min(
            44,
            Math.floor((252 - (level.width - 1) * 6) / level.width)
          )}
          disabled={!testing || session.present.phase !== 'playing'}
          hidePlayer={false}
          flashTileId={null}
          onSelect={(id) => {
            const result = commitInteraction(level, testSession, id);
            if (result.result.ok) {
              setTestSession(result.session);
              setTestError('');
            } else
              setTestError(
                result.result.reason === 'non-integer-result'
                  ? 'Division must give a whole number.'
                  : result.result.reason === 'non-positive-result'
                    ? 'Subtraction must leave at least 1.'
                    : 'That move is blocked.'
              );
          }}
          onClearSelection={() => {}}
          avatarUrl={null}
        />
      </div>
      {testing ? (
        <div className="hub-controls">
          <button
            type="button"
            aria-label={t('Undo move')}
            title={t('Undo move')}
            disabled={!testSession.past.length}
            onClick={() => {
              setTestSession(undo(testSession));
              setTestError('');
            }}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            aria-label={t('Restart test')}
            title={t('Restart test')}
            onClick={() => {
              setTestSession(createSession(level));
              setTestError('');
            }}
          >
            <RotateCcw size={18} />
          </button>
          <span>
            {t('game.you')} {session.present.value.toString()}
          </span>
          <span role="status">
            {session.present.phase === 'won'
              ? t('Solved')
              : session.present.phase === 'lost'
                ? t('No lives left. Undo or restart.')
                : ''}
          </span>
        </div>
      ) : (
        <div className="hub-controls">
          <button
            type="button"
            title={t('Previous action')}
            aria-label={t('Previous action')}
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={18} />
          </button>
          <span>
            {step} / {submission.actions.length}
          </span>
          <button
            type="button"
            title={t('Next action')}
            aria-label={t('Next action')}
            disabled={step === submission.actions.length}
            onClick={() => setStep(step + 1)}
          >
            <ArrowRight size={18} />
          </button>
          <span>
            {t('game.you')} {session.present.value.toString()}
          </span>
        </div>
      )}
      {testError && (
        <p className="hub-message builder-violation" role="alert">
          {t(testError)}
        </p>
      )}
      <p>
        {t('Submitted target')}: {t(`difficulty.${submission.difficulty}`)}
      </p>
      <Assessment value={submission.assessment} />
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(JSON.stringify(submission, null, 2))
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        <ClipboardCopy size={17} />
        {t(copied ? 'Copied' : 'Copy submission')}
      </button>
    </div>
  );
}

function Submissions({
  moderator,
  revision,
  onChanged,
}: {
  moderator: boolean;
  revision: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<
    'mine' | 'submitted' | 'accepted' | 'rejected'
  >('mine');
  const [declining, setDeclining] = useState<CommunitySubmission | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [submissions, setSubmissions] = useState<CommunitySubmission[] | null>(
    null
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const path = view === 'mine' ? '/submissions' : `/review?status=${view}`;
    void communityRequest<{ submissions: CommunitySubmission[] }>(path)
      .then((result) => {
        if (!cancelled) {
          setSubmissions(result.submissions);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load submissions.'
          );
      });
    return () => {
      cancelled = true;
    };
  }, [view, revision]);
  async function update(
    submission: CommunitySubmission,
    status: 'accepted' | 'rejected' | 'withdraw',
    reason?: string
  ) {
    setBusy(true);
    setError('');
    try {
      await communityRequest(
        status === 'withdraw' ? '/withdraw' : '/review',
        status === 'withdraw'
          ? { id: submission.id }
          : {
              id: submission.id,
              authorId: submission.authorId,
              status,
              ...(status === 'rejected' ? { declineReason: reason } : {}),
            }
      );
      setSubmissions(null);
      setDeclining(null);
      onChanged();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save changes.'
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hub-submissions">
      <div className="hub-section-heading">
        <h2>{t('Submissions')}</h2>
        <button
          type="button"
          aria-label={t('Refresh submissions')}
          title={t('Refresh submissions')}
          onClick={onChanged}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {moderator && (
        <div
          className="hub-controls"
          role="group"
          aria-label={t('Submission list')}
        >
          {(
            [
              { id: 'mine', label: 'Mine' },
              { id: 'submitted', label: 'Review queue' },
              { id: 'accepted', label: 'Shortlisted' },
              { id: 'rejected', label: 'Declined' },
            ] satisfies { id: typeof view; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => {
                setView(item.id);
                setSubmissions(null);
              }}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert">
          {t(error, { defaultValue: t('Could not save changes.') })}
        </p>
      )}
      {submissions === null ? (
        <p role="status">{t('Loading submissions...')}</p>
      ) : submissions.length === 0 ? (
        <p className="hub-empty">{t('No submissions.')}</p>
      ) : (
        submissions.map((submission) => (
          <article
            className="hub-submission"
            key={`${submission.authorId}:${submission.id}`}
          >
            <div>
              <h3>{submission.level.title}</h3>
              <p>
                {submission.author} · {t(`difficulty.${submission.difficulty}`)}{' '}
                · {t('{{count}} steps', { count: submission.steps })}
              </p>
              {submission.declineReason && (
                <blockquote className="hub-message">
                  {submission.declineReason}
                </blockquote>
              )}
              <p className="submission-state">
                {t(
                  submission.status === 'accepted'
                    ? 'Shortlisted for offline certification'
                    : submission.status === 'rejected'
                      ? 'Not selected'
                      : 'Awaiting review'
                )}
              </p>
            </div>
            <details>
              <summary>{t('Inspect puzzle')}</summary>
              <SubmissionPreview submission={submission} />
            </details>
            <div className="hub-controls">
              {view === 'mine' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void update(submission, 'withdraw')}
                >
                  <Trash2 size={16} />
                  {t('Withdraw')}
                </button>
              ) : (
                <>
                  {submission.status !== 'accepted' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void update(submission, 'accepted')}
                    >
                      <Check size={17} />
                      {t('Shortlist')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDeclining(submission);
                      setDeclineReason(submission.declineReason ?? '');
                    }}
                  >
                    <X size={17} />
                    {t('Decline')}
                  </button>
                </>
              )}
            </div>
          </article>
        ))
      )}
      <AppDialog
        open={Boolean(declining)}
        title={t('Decline puzzle')}
        dismissible={!busy}
        onOpenChange={(open) => {
          if (!open) setDeclining(null);
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (declining && !busy && declineReason.trim())
              void update(declining, 'rejected', declineReason.trim());
          }}
        >
          <label className="builder-title-prompt">
            {t('Reason for contributor')}
            <textarea
              aria-label={t('Reason for contributor')}
              required
              maxLength={500}
              rows={4}
              value={declineReason}
              onChange={(event) => setDeclineReason(event.currentTarget.value)}
            />
          </label>
          {error && (
            <p role="alert" className="builder-violation">
              {t(error, { defaultValue: t('Could not save changes.') })}
            </p>
          )}
          <button type="submit" disabled={busy || !declineReason.trim()}>
            <X size={17} />
            {t('Decline')}
          </button>
        </form>
      </AppDialog>
    </section>
  );
}

export function CommunityHub({
  initialTab = 'about',
}: {
  initialTab?: 'about' | 'game' | 'rankings' | 'contribute';
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(initialTab);
  const [expanded, setExpanded] = useState(isExpanded);
  const [init, setInit] = useState<HubInit | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubmissions, setShowSubmissions] = useState(false);
  const [showLimits, setShowLimits] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [preferences, setPreferences] = useState(() => {
    try {
      return displayPreferencesSchema.parse(
        JSON.parse(localStorage.getItem('outnumber-display') ?? '{}')
      );
    } catch {
      return displayPreferencesSchema.parse({});
    }
  });
  const tokenRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const update = () => setExpanded(isExpanded());
    window.addEventListener('focus', update);
    window.addEventListener('message', update);
    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('message', update);
    };
  }, []);
  function contribute(event: MouseEvent) {
    if (expanded || initialTab === 'contribute') setTab('contribute');
    else requestExpandedMode(event, 'contribute');
  }
  useEffect(() => {
    let cancelled = false;
    void communityRequest<HubInit>('/init')
      .then((result) => {
        if (!cancelled) setInit(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error ? reason.message : 'Could not connect.'
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <main
      className={`community-hub community-hub--${tab}${expanded ? ' community-hub--expanded' : ''}`}
    >
      <AppAppearance {...preferences} />
      <header
        className={`hub-hero${tab !== 'about' ? ' hub-hero--compact' : ''}`}
      >
        <SplashBoard tokenRef={tokenRef} />
        {tab !== 'about' && (
          <button
            type="button"
            className="hub-home icon-button"
            aria-label={t('Back to front page')}
            title={t('Back to front page')}
            onClick={() => {
              setTab('about');
              setShowSubmissions(false);
            }}
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <button
          type="button"
          className="hub-settings icon-button"
          aria-label={t('Settings')}
          title={t('Settings')}
          onClick={() => setShowSettings(true)}
        >
          <Settings size={24} />
        </button>
        <button
          type="button"
          className="hub-expand"
          title={t(expanded ? 'Return to post' : 'Expand community hub')}
          aria-label={t(expanded ? 'Return to post' : 'Expand community hub')}
          onClick={(event) =>
            expanded
              ? exitExpandedMode(event.nativeEvent)
              : requestExpandedMode(
                  event.nativeEvent,
                  tab === 'rankings'
                    ? 'leaders'
                    : tab === 'contribute'
                      ? 'contribute'
                      : tab === 'game'
                        ? 'intro'
                        : 'hub'
                )
          }
        >
          {expanded ? <Minimize2 size={24} /> : <Maximize2 size={24} />}
        </button>
        <div
          className="hub-hero-copy"
          onClick={() => {
            setTab('about');
            setShowSubmissions(false);
          }}
        >
          <h1 aria-label="Outnumber">
            <span className="wordmark-o" ref={tokenRef} aria-hidden="true" />
            <span aria-hidden="true">utnumber</span>
          </h1>
          {tab === 'about' && <p>{t('A daily numbers puzzle.')}</p>}
          {tab === 'about' && (
            <button
              type="button"
              className="hub-primary hub-front-play"
              onClick={(event) => {
                event.stopPropagation();
                requestExpandedMode(event.nativeEvent, 'game');
              }}
            >
              <Play size={18} />
              {t('Play today')}
            </button>
          )}
        </div>
        <nav className="hub-nav" aria-label={t('Community hub')}>
          {[
            { id: 'game', label: 'Game', icon: BookOpen },
            { id: 'rankings', label: 'Leaders', icon: Trophy },
            { id: 'contribute', label: 'Contribute', icon: Hammer },
          ].map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-current={tab === id ? 'page' : undefined}
              onClick={(event) =>
                id === 'contribute'
                  ? contribute(event.nativeEvent)
                  : setTab(z.enum(['game', 'rankings']).parse(id))
              }
            >
              <Icon size={18} />
              {t(label)}
            </button>
          ))}
        </nav>
      </header>
      {error && (
        <p className="hub-message" role="alert">
          {t(error, { defaultValue: t('Could not connect.') })}
        </p>
      )}
      {tab === 'game' && (
        <section className="hub-game" aria-label={t('How Outnumber works')}>
          <RoutePlayback
            level={guidedLevel}
            solution={guidedActions}
            avatarUrl={null}
            boardLabel={t('Game demonstration')}
            compact
            finishedContent={
              <div className="hub-finished-buttons">
                <button
                  type="button"
                  className="hub-watch-video"
                  onClick={() => {
                    setVideoError(false);
                    setShowVideo(true);
                  }}
                >
                  <Video size={18} />
                  {t('Watch video')}
                </button>
                <button
                  type="button"
                  className="hub-primary hub-play-today"
                  onClick={(event) =>
                    requestExpandedMode(event.nativeEvent, 'game')
                  }
                >
                  <Play size={18} />
                  {t('Play today')}
                </button>
              </div>
            }
          />
          <AppDialog
            open={showVideo}
            title={t('Watch video')}
            className={`hub-video-dialog${expanded ? ' hub-video-dialog--expanded' : ''}`}
            dismissible
            onOpenChange={setShowVideo}
          >
            {showVideo && (
              <video
                className="hub-promo-video"
                src="/outnumber-synced.mp4"
                aria-label={t('Outnumber promotional video')}
                controls
                playsInline
                autoPlay
                preload="none"
                onError={() => setVideoError(true)}
              />
            )}
            {videoError && (
              <p role="alert">
                {t('Video could not load. Close and try again.')}
              </p>
            )}
          </AppDialog>
        </section>
      )}
      {tab === 'rankings' && (
        <>
          <CommunityLeaderboard />
          <p className="hub-footnote">
            {t('Ranked solves since {{date}}. Daily release: 00:00 UTC.', {
              date: init?.rankingStartDate ?? '2026-11-24',
            })}
          </p>
        </>
      )}
      {(expanded || initialTab === 'contribute') && (
        <div hidden={tab !== 'contribute'} className="hub-contribution-layout">
          <PuzzleBuilder
            hidden={tab !== 'contribute' || showSubmissions}
            signedIn={Boolean(init?.signedIn)}
            onShowSubmissions={() => setShowSubmissions(true)}
            onShowLimits={() => setShowLimits(true)}
            onSubmitted={() => setRevision((previous) => previous + 1)}
          />
          {showSubmissions && (
            <section className="hub-submission-page">
              <div className="hub-section-heading">
                <button
                  type="button"
                  className="icon-button"
                  title={t('Back to editor')}
                  aria-label={t('Back to editor')}
                  onClick={() => setShowSubmissions(false)}
                >
                  <ArrowLeft size={24} />
                </button>
              </div>
              {!init?.signedIn && <p>{t('Sign in to view submissions.')}</p>}
              {init?.signedIn && (
                <Submissions
                  moderator={init.moderator}
                  revision={revision}
                  onChanged={() => setRevision((previous) => previous + 1)}
                />
              )}
            </section>
          )}
          <AppDialog
            open={showLimits}
            title={t('Submission limits')}
            dismissible
            onOpenChange={setShowLimits}
          >
            <ul className="hub-submission-limits">
              <li>{t('Easy: up to 4 × 5. Medium: 5 × 6. Hard: 6 × 7.')}</li>
              <li>
                {t('Printed values below 1,000; at most two spare lives.')}
              </li>
              <li>{t('One boss, connected floor, and a winning test run.')}</li>
              <li>{t('Up to 10 saved submissions per author.')}</li>
            </ul>
          </AppDialog>
        </div>
      )}
      <AppDialog
        open={showSettings}
        title={t('Settings')}
        dismissible
        onOpenChange={setShowSettings}
      >
        <GameSettings
          {...preferences}
          onChange={(next) => {
            setPreferences(next);
            try {
              localStorage.setItem('outnumber-display', JSON.stringify(next));
            } catch {
              return;
            }
          }}
        />
      </AppDialog>
    </main>
  );
}
