import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { GameState } from '../../shared/game/model';
import {
  BookOpen,
  Flame,
  SlidersHorizontal,
  MessageCircle,
  Trophy,
  Archive,
  Check,
  Monitor,
  Maximize2,
  Minimize2,
  Settings,
} from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import {
  context,
  exitExpandedMode,
  getWebViewMode,
  requestExpandedMode,
} from '@devvit/web/client';
import { DIFFICULTIES, type Difficulty } from '../../shared/season';
import {
  rememberIdentity,
  restoredDifficulty,
  restoredIdentity,
} from '../app/difficulty-preference';
import { DifficultySelector } from '../components/DifficultySelector';
import { AppAppearance } from '../app/AppAppearance';
import { playSoundEffect, unlockSoundEffects } from '../app/sound-effects';
import {
  displayPreferencesSchema,
  type DisplayPreferences,
} from '../app/theme-palettes';
import { PuzzleArchive } from '../components/PuzzleArchive';
import { PuzzleCountdown } from '../components/PuzzleCountdown';
import { GameSettings } from '../components/GameSettings';
import { ShareResult } from '../components/ShareResult';
import { interact } from '../../shared/game/engine';
import { BoardStage } from '../components/BoardStage';
import { PlayerStatus } from '../components/PlayerStatus';
import { TutorialScreen } from './TutorialScreen';
import { AppDialog } from '../components/AppDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Leaderboard } from '../components/Leaderboard';
import { UndoIcon, RestartIcon } from '../components/icons';
import { formatAnnouncement } from '../components/game-event-announcement';
import { formatInteractionFailure } from '../components/interaction-failure';
import { translator } from '../components/i18n-types';
import { useInteractionAnimation } from '../presentation/useInteractionAnimation';
import { useMediaQuery } from '../app/useMediaQuery';
import { useDailyGame } from '../hooks/useDailyGame';
import { useEndCard } from '../hooks/useEndCard';
import { useReloadablePanel } from '../hooks/useReloadablePanel';

const expansionIdentity = restoredIdentity(context?.postId ?? 'local');

function expandedView(): boolean {
  try {
    return getWebViewMode() === 'expanded';
  } catch {
    return false;
  }
}

const preferenceSchema = displayPreferencesSchema;

function restoredPreferences(): DisplayPreferences {
  try {
    const parsed = preferenceSchema.safeParse(
      JSON.parse(localStorage.getItem('outnumber-display') ?? 'null')
    );
    if (parsed.success) return parsed.data;
  } catch {
    return preferenceSchema.parse({});
  }
  return preferenceSchema.parse({});
}

export function DailyGameScreen() {
  const [selectedDate, setSelectedDate] = useState(expansionIdentity?.date);
  const [difficulty, setDifficulty] = useState(
    expansionIdentity?.difficulty ?? restoredDifficulty()
  );
  const selectDate = (date: string, nextDifficulty: Difficulty) => {
    if (expandedView())
      rememberIdentity(context?.postId ?? 'local', {
        date,
        difficulty: nextDifficulty,
      });
    setSelectedDate(date);
    setDifficulty(nextDifficulty);
  };
  useEffect(() => {
    const receiveDate = () => {
      const identity = restoredIdentity(context?.postId ?? 'local');
      if (identity) {
        setSelectedDate(identity.date);
        setDifficulty(identity.difficulty);
      }
    };
    window.addEventListener('focus', receiveDate);
    return () => window.removeEventListener('focus', receiveDate);
  }, []);
  return (
    <DailySession
      key={`${selectedDate ?? 'post'}:${difficulty}`}
      selectedDate={selectedDate}
      difficulty={difficulty}
      onDateChange={selectDate}
    />
  );
}

function DailySession({
  selectedDate,
  difficulty,
  onDateChange,
}: {
  selectedDate: string | undefined;
  difficulty: Difficulty;
  onDateChange: (date: string, difficulty: Difficulty) => void;
}) {
  const { t, i18n } = useTranslation();
  const game = useDailyGame(selectedDate, difficulty);
  const [preferences, setPreferences] = useState(restoredPreferences);
  const systemReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const reducedMotion = systemReduced || preferences.motion === 'reduced';
  const desktop = useMediaQuery('(min-width: 768px)');
  const [expanded, setExpanded] = useState(expandedView);
  useEffect(() => {
    const updateMode = () => setExpanded(expandedView());
    window.addEventListener('focus', updateMode);
    window.addEventListener('message', updateMode);
    return () => {
      window.removeEventListener('focus', updateMode);
      window.removeEventListener('message', updateMode);
    };
  }, []);
  const panelDate =
    selectedDate === game.postDate ? 'post' : (selectedDate ?? 'post');
  const panelScope = `${context?.postId ?? 'local'}:${panelDate}:${difficulty}`;
  const [showArchive, setShowArchive] = useReloadablePanel(
    'archive',
    panelScope
  );
  const [showSettings, setShowSettings] = useReloadablePanel(
    'settings',
    panelScope
  );
  const [showTutorials, setShowTutorials] = useReloadablePanel(
    'tutorials',
    panelScope
  );
  const [blocked, setBlocked] = useState(0);
  const [failureReason, setFailureReason] = useState('unreachable');
  const [pending, setPending] = useState(false);
  const savingRef = useRef(false);
  const [optimisticState, setOptimisticState] = useState<GameState | null>(
    null
  );
  const [saveError, setSaveError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [sharingResult, setSharingResult] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showLevels, setShowLevels] = useState(false);

  const animation = useInteractionAnimation({
    reducedMotion,
    onSettled: (event) =>
      setAnnouncement(formatAnnouncement(translator(t), event)),
  });
  const refreshOnFocus = useEffectEvent(() => {
    if (!savingRef.current && !animation.busyRef.current && !game.loading)
      game.refresh();
  });
  useEffect(() => {
    const refresh = () => refreshOnFocus();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const { level, state: savedState } = game;
  const present = optimisticState ?? savedState;
  const phase = savedState?.phase;
  const completion = useEndCard(game.date, phase === 'won', difficulty);
  const { endCard } = completion;

  // Open the result dialog whenever the attempt reaches a terminal
  // phase (including a run restored from the server already finished).
  const [seenPhase, setSeenPhase] = useState(phase);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (seenPhase === 'playing' && phase !== undefined && phase !== 'playing')
      setResultOpen(true);
  }

  if (showTutorials)
    return (
      <TutorialScreen
        onClose={() => setShowTutorials(false)}
        avatarUrl={game.avatarUrl}
      />
    );

  if (game.loading) {
    return (
      <div className="puzzle-state" role="status" aria-live="polite">
        <div className="puzzle-loading-board" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>{t('daily.loading')}</p>
      </div>
    );
  }
  if (game.error || !level || !present) {
    return (
      <div className="puzzle-state" role="alert">
        <p>{t('daily.error')}</p>
        <button type="button" className="toolbar-button" onClick={game.retry}>
          <RestartIcon /> {t('ui.retry')}
        </button>
      </div>
    );
  }

  const animating = animation.animating || pending;
  const signedOut = context !== undefined && !context.userId;
  const finalizing = phase === 'won' && endCard === null;

  const handleSelect = async (id: string): Promise<void> => {
    if (
      animation.busyRef.current ||
      savingRef.current ||
      present.phase !== 'playing' ||
      id === `walk:${present.position}`
    )
      return;
    const preview = interact(level, present, id);
    if (!preview.ok) {
      setFailureReason(preview.reason);
      setBlocked((value) => value + 1);
      return;
    }
    setBlocked(0);
    setSaveError('');
    unlockSoundEffects();
    animation.markBusy();
    setPending(true);
    savingRef.current = true;
    setOptimisticState(preview.state);
    let revealed = false;
    let confirmed = false;
    const playWhenReady = () => {
      if (revealed && confirmed) playSoundEffect(preview.event.kind);
    };
    animation.start(preview, level, present, () => {
      revealed = true;
      playWhenReady();
    });
    const outcome = await game.commit(id);
    savingRef.current = false;
    setPending(false);
    setOptimisticState(null);
    if (!outcome) {
      animation.cancel();
      setSaveError(t('ui.saveTurnError'));
      setAnnouncement(t('ui.saveTurnError'));
      return;
    }
    confirmed = true;
    playWhenReady();
  };

  const handleUndo = async (): Promise<void> => {
    if (animation.busyRef.current || savingRef.current) return;
    animation.markBusy();
    setPending(true);
    const ok = await game.undo();
    setPending(false);
    animation.cancel();
    if (ok) {
      setBlocked(0);
      setAnnouncement(t('announce.undo'));
      setResultOpen(false);
    }
  };

  const doRestart = async (): Promise<void> => {
    if (animation.busyRef.current || savingRef.current) return;
    setConfirmRestart(false);
    animation.markBusy();
    setPending(true);
    const ok = await game.restart();
    setPending(false);
    animation.cancel();
    if (ok) {
      setBlocked(0);
      setAnnouncement(t('announce.restart'));
      setResultOpen(false);
    }
  };

  const handleRestart = (): void => {
    if (animation.busyRef.current || savingRef.current) return;
    if (game.actions >= 1) {
      setConfirmRestart(true);
      return;
    }
    void doRestart();
  };

  const won = present.phase === 'won';
  const hasUnfinishedLevels =
    won &&
    DIFFICULTIES.some((next) => {
      const progress = game.progress?.[next];
      return (
        next !== difficulty &&
        progress !== undefined &&
        !progress.completed &&
        progress.bestSteps === null
      );
    });
  const changePreferences = (next: typeof preferences) => {
    setPreferences(next);
    try {
      localStorage.setItem('outnumber-display', JSON.stringify(next));
    } catch {
      return;
    }
  };

  return (
    <div
      className={`screen game-screen daily-game${won ? ' daily-game--won' : ''}${expanded ? ' daily-game--expanded' : ''}`}
    >
      <AppAppearance {...preferences} />
      <header className="daily-header">
        <div className="daily-heading">
          <p className="daily-eyebrow">OUTNUMBER</p>
          <h1 className="daily-header-title" data-difficulty={difficulty}>
            {level.title}
          </h1>
          <div className="daily-date-row">
            <p className="daily-header-date number">
              {new Date(`${game.date}T00:00:00Z`).toLocaleDateString(
                i18n.resolvedLanguage,
                { dateStyle: 'medium', timeZone: 'UTC' }
              )}
            </p>
            <PuzzleCountdown date={game.date} compact />
          </div>
        </div>
        <div className="daily-header-tools">
          <button
            type="button"
            className="icon-button"
            title={t('ui.puzzleArchive')}
            aria-label={t('ui.puzzleArchive')}
            disabled={animating || finalizing}
            onClick={() => setShowArchive(true)}
          >
            <Archive />
          </button>
          <button
            type="button"
            className="icon-button"
            title={t('settings.title')}
            aria-label={t('settings.title')}
            onClick={() => setShowSettings(true)}
          >
            <Settings />
          </button>
          <button
            type="button"
            className="icon-button daily-expand"
            title={
              expanded
                ? t('ui.returnToPost')
                : desktop
                  ? t('ui.openDesktopView')
                  : t('ui.expandGame')
            }
            aria-label={
              expanded
                ? t('ui.returnToPost')
                : desktop
                  ? t('ui.openDesktopView')
                  : t('ui.expandGame')
            }
            disabled={animating || finalizing}
            onClick={(event) => {
              rememberIdentity(context?.postId ?? 'local', {
                date: game.date,
                difficulty,
              });
              if (expandedView()) exitExpandedMode(event.nativeEvent);
              else requestExpandedMode(event.nativeEvent, 'game');
            }}
          >
            {expanded ? <Minimize2 /> : desktop ? <Monitor /> : <Maximize2 />}
          </button>
        </div>
        <div className="daily-header-metrics">
          {expanded && (
            <p className="daily-steps number">
              <Trans
                t={t}
                i18nKey="ui.steps"
                values={{ steps: game.steps }}
                components={{ strong: <strong /> }}
              />
            </p>
          )}

          <PlayerStatus
            level={level}
            state={
              animation.presentation && !animation.presentation.frame?.revealed
                ? animation.presentation.frozen
                : present
            }
          />
        </div>
      </header>

      <div
        className={`daily-board ${blocked ? `is-blocked is-blocked--${blocked % 2}` : ''}`}
      >
        <div className="daily-board-scene">
          <BoardStage
            level={level}
            present={present}
            presentation={animation.presentation}
            selectedId={null}
            selectionPath={null}
            disabled={present.phase !== 'playing' || animating || signedOut}
            flashTileId={animation.flashTileId}
            onSelect={(id) => void handleSelect(id)}
            onClearSelection={() => {}}
            avatarUrl={game.avatarUrl}
          />
          {won && !animating && (
            <button
              type="button"
              className="board-win-mark"
              title={t('result.results')}
              aria-label={t('result.results')}
              onClick={() => setResultOpen(true)}
            >
              <Check strokeWidth={3} aria-hidden="true" />
              <span>{t('result.results')}</span>
            </button>
          )}
        </div>
        <p className="board-feedback" role="status">
          {signedOut
            ? t('ui.signInToSave')
            : blocked
              ? formatInteractionFailure(translator(t), failureReason)
              : saveError ||
                (completion.failed
                  ? t('ui.verifyError')
                  : finalizing
                    ? t('ui.verifyingResult')
                    : '')}
        </p>
        {completion.failed && (
          <button
            type="button"
            className="toolbar-button"
            onClick={completion.retry}
          >
            <RestartIcon /> {t('ui.retryResult')}
          </button>
        )}
      </div>

      <nav className="toolbar game-toolbar" aria-label={t('game.controls')}>
        <button
          type="button"
          title={t('ui.tutorials')}
          className="toolbar-button"
          disabled={animating || finalizing}
          onClick={() => setShowTutorials(true)}
        >
          <BookOpen />
          <span>{t('ui.tutorials')}</span>
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={animating || finalizing || game.actions === 0}
          onClick={() => void handleUndo()}
        >
          <UndoIcon />
          <span>{t('common.undo')}</span>
        </button>
        <button
          type="button"
          className="toolbar-button"
          disabled={animating || finalizing}
          onClick={handleRestart}
        >
          <RestartIcon />
          <span>{t('common.restart')}</span>
        </button>
        <button
          type="button"
          className={`toolbar-button level-button${hasUnfinishedLevels ? ' action-highlight' : ''}`}
          disabled={animating || finalizing}
          onClick={() => setShowLevels(true)}
        >
          <SlidersHorizontal />
          <span>{t('common.level')}</span>
        </button>
      </nav>

      <AppDialog
        open={showArchive}
        title={t('ui.puzzleArchive')}
        dismissible
        onOpenChange={setShowArchive}
      >
        <PuzzleArchive
          selectedDate={game.date}
          difficulty={difficulty}
          onSelect={(date, nextDifficulty) => {
            setShowArchive(false);
            onDateChange(date, nextDifficulty);
          }}
        />
      </AppDialog>

      <AppDialog
        open={showSettings}
        title={t('settings.title')}
        dismissible
        onOpenChange={setShowSettings}
      >
        <GameSettings {...preferences} onChange={changePreferences} />
      </AppDialog>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <AppDialog
        open={resultOpen && present.phase !== 'playing' && !animating}
        title={won ? t('result.winTitle') : t('result.lostTitle')}
        variant={won ? 'won' : 'lost'}
        titleIcon={won ? <Trophy /> : undefined}
        dismissible
        onOpenChange={(open) => {
          setResultOpen(open);
          if (!open) setSharingResult(false);
        }}
      >
        <div className="daily-result">
          {won ? (
            sharingResult ? (
              <ShareResult
                key={`${game.date}:${difficulty}`}
                date={game.date}
                difficulty={difficulty}
                steps={game.steps}
                onCancel={() => setSharingResult(false)}
              />
            ) : (
              <>
                <p className="result-score number">
                  <span>{t(`difficulty.${difficulty}`)} </span>
                  <Trans
                    t={t}
                    i18nKey="ui.steps"
                    values={{ steps: game.steps }}
                    components={{ strong: <strong /> }}
                  />
                </p>
                <div className="result-stats">
                  <span>
                    <Trans
                      t={t}
                      i18nKey="ui.par"
                      values={{ steps: game.parSteps ?? game.parActions }}
                      components={{ b: <b /> }}
                    />
                  </span>
                  {game.bestSteps !== null ? (
                    <span>
                      <Trans
                        t={t}
                        i18nKey="ui.best"
                        values={{ steps: game.bestSteps }}
                        components={{ b: <b /> }}
                      />
                    </span>
                  ) : null}
                  {endCard ? (
                    <>
                      {endCard.rank !== null ? (
                        <span>
                          <Trophy size={16} /> #{endCard.rank}
                        </span>
                      ) : null}
                      {endCard.streak > 0 ? (
                        <span className="result-streak">
                          <Flame size={18} /> {endCard.streak}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="daily-result-actions">
                  <button
                    type="button"
                    className="toolbar-button"
                    disabled={finalizing}
                    onClick={() => void doRestart()}
                  >
                    <RestartIcon />
                    <span>{t('daily.playAgain')}</span>
                  </button>
                  <button
                    type="button"
                    className="toolbar-button"
                    onClick={() => setShowLeaderboard(true)}
                  >
                    <Trophy />
                    <span>{t('ui.leaderboard')}</span>
                  </button>
                  <button
                    type="button"
                    className="toolbar-button action-highlight"
                    disabled={
                      finalizing ||
                      signedOut ||
                      !context?.postId ||
                      game.date !== game.postDate
                    }
                    onClick={() => setSharingResult(true)}
                  >
                    <MessageCircle />
                    <span>{t('ui.shareResult')}</span>
                  </button>
                </div>
              </>
            )
          ) : (
            <>
              <p>{t('result.lostBody')}</p>
              <div className="daily-result-actions">
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => void handleUndo()}
                >
                  <UndoIcon />
                  <span>{t('common.undo')}</span>
                </button>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => void doRestart()}
                >
                  <RestartIcon />
                  <span>{t('common.restart')}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </AppDialog>

      <ConfirmDialog
        open={confirmRestart}
        title={t('common.restart')}
        message={t('daily.restartConfirm')}
        confirmLabel={t('common.restart')}
        onConfirm={() => void doRestart()}
        onCancel={() => setConfirmRestart(false)}
      />

      <AppDialog
        open={showLeaderboard}
        title={`${t('leaderboard.title')} · ${t(`difficulty.${difficulty}`)}`}
        dismissible
        onOpenChange={(open) => setShowLeaderboard(open)}
      >
        <Leaderboard
          key={`${game.date}:${difficulty}`}
          date={game.date}
          difficulty={difficulty}
        />
      </AppDialog>

      <AppDialog
        open={showLevels}
        title={t('common.level')}
        dismissible
        onOpenChange={setShowLevels}
      >
        <DifficultySelector
          expanded
          value={difficulty}
          progress={game.progress ?? undefined}
          onChange={(next) => {
            setShowLevels(false);
            onDateChange(game.date, next);
          }}
        />
      </AppDialog>
    </div>
  );
}
