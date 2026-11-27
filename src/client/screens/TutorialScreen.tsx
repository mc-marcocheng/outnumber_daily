import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Flag,
  RotateCcw,
  Undo2,
  X,
} from 'lucide-react';
import {
  commitInteraction,
  createSession,
  restoreSession,
  undo,
} from '../../shared/game/session';
import {
  guidedActions,
  guidedLevel,
  guidedPages,
  lessons,
} from '../tutorials/lessons';
import { BoardStage } from '../components/BoardStage';
import { PlayerStatus } from '../components/PlayerStatus';
import { PlayerToken } from '../components/PlayerToken';
import { useInteractionAnimation } from '../presentation/useInteractionAnimation';
import { useMediaQuery } from '../app/useMediaQuery';
import { interact } from '../../shared/game/engine';
import { AppDialog } from '../components/AppDialog';
import { RoutePlayback } from '../tutorials/RoutePlayback';
import { ruleDemos } from '../tutorials/rule-demos';
import { playSoundEffect, unlockSoundEffects } from '../app/sound-effects';
import { formatInteractionFailure } from '../components/interaction-failure';
import { translator } from '../components/i18n-types';
import { formatAnnouncement } from '../components/game-event-announcement';

const practiceTiles: Record<string, readonly [kind: string, sign?: string]> = {
  walking: ['player'],
  addition: ['add', '+'],
  multiply: ['multiply', '\u00d7'],
  undo: ['multiply', '\u00d7'],
  window: ['enemy'],
  subtract: ['subtract', '\u2212'],
  divide: ['divide', '\u00f7'],
  set: ['set', '='],
  bank: ['enemy'],
  blocked: ['boss'],
};

const guidedRules = [
  'player',
  'walking',
  'addition',
  'multiply',
  'set',
  'combat',
  'window',
  'bank',
  null,
  'boss',
];
const RULE_STORAGE_KEY = 'outnumber-tutorial-rules-v1';
const PROGRESS_STORAGE_KEY = 'outnumber-tutorial-progress-v1';
const GUIDED_STOP = 'guided';

function readTutorialIds(key: string): readonly string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(saved))
      return saved.filter((rule): rule is string => typeof rule === 'string');
  } catch {
    return [];
  }
  return [];
}

function saveTutorialIds(key: string, ids: readonly string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    return;
  }
}

const routeStops = Array.from({ length: lessons.length + 1 }, (_, index) => {
  const row = Math.floor(index / 3);
  const lane = index % 3;
  const column = row % 2 ? 2 - lane : lane;
  return { column, row, x: ((column + 0.5) * 1000) / 3, y: row * 114 + 38 };
});
const tutorialRoad = routeStops.slice(1).reduce((path, stop, index) => {
  const previous = routeStops[index]!;
  if (stop.row === previous.row) return `${path} H ${stop.x}`;
  const bend = stop.x + (stop.column === 0 ? -145 : 145);
  return `${path} C ${bend} ${previous.y} ${bend} ${stop.y} ${stop.x} ${stop.y}`;
}, `M ${routeStops[0]!.x} ${routeStops[0]!.y}`);

function RouteMarker({ avatarUrl }: { avatarUrl: string | null }) {
  return (
    <span className="tutorial-route-token" aria-hidden="true">
      <PlayerToken avatarUrl={avatarUrl} value={1n} />
    </span>
  );
}

export function TutorialScreen({
  onClose,
  avatarUrl,
}: {
  onClose: () => void;
  avatarUrl: string | null;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [session, setSession] = useState(() =>
    createSession(lessons[0]!.level)
  );
  const [blocked, setBlocked] = useState(0);
  const [failureReason, setFailureReason] = useState('unreachable');
  const [announcement, setAnnouncement] = useState('');
  const [completed, setCompleted] = useState(() =>
    readTutorialIds(PROGRESS_STORAGE_KEY)
  );
  const guidedCompleted = completed.includes(GUIDED_STOP);
  const [showRoute, setShowRoute] = useState(false);
  const [seenRules, setSeenRules] = useState(() =>
    readTutorialIds(RULE_STORAGE_KEY)
  );
  const ruleReturn = useRef<HTMLButtonElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = useInteractionAnimation({
    reducedMotion,
    onSettled: (event) =>
      setAnnouncement(formatAnnouncement(translator(t), event)),
  });
  const guided = active === -1;
  const lesson = active !== null && active >= 0 ? lessons[active] : undefined;
  const level = guided ? guidedLevel : lesson?.level;
  const state = guided
    ? restoreSession(guidedLevel, guidedActions.slice(0, page)).present
    : session.present;
  const selectedPage = guidedPages[page]!;
  const rule = guided
    ? guidedRules[page]
    : lesson?.id === 'blocked'
      ? 'walking'
      : lesson?.id;
  const showRule = rule && !seenRules.includes(rule) && !animation.animating;
  const ruleDemo = rule ? ruleDemos[rule] : undefined;
  const lessonTitle = lesson && t(`tutorial.lesson.${lesson.id}.title`);
  const ruleTitle = guided
    ? t(`tutorial.guided.page.${page}.title`)
    : (lessonTitle ?? '');
  const nextStop = guidedCompleted
    ? lessons.findIndex(({ id }) => !completed.includes(id)) + 1 || null
    : 0;
  const acknowledgeRule = (id: string) => {
    const next = [...seenRules, id];
    setSeenRules(next);
    saveTutorialIds(RULE_STORAGE_KEY, next);
  };
  const completeStop = (id: string) => {
    if (completed.includes(id)) return;
    const next = [...completed, id];
    setCompleted(next);
    saveTutorialIds(PROGRESS_STORAGE_KEY, next);
  };
  const select = (index: number) => {
    animation.cancel();
    setActive(index);
    setPage(0);
    setBlocked(0);
    setAnnouncement('');
    setShowRoute(false);
    if (index >= 0) setSession(createSession(lessons[index]!.level));
  };
  const play = (action: string) => {
    if (
      animation.busyRef.current ||
      !lesson ||
      action === `walk:${session.present.position}`
    )
      return;
    const outcome = commitInteraction(lesson.level, session, action);
    if (!outcome.result.ok) {
      setFailureReason(outcome.result.reason);
      setBlocked((value) => value + 1);
      return;
    }
    setBlocked(0);
    setAnnouncement('');
    setSession(outcome.session);
    unlockSoundEffects();
    animation.markBusy();
    const soundKind = outcome.result.event.kind;
    animation.start(outcome.result, lesson.level, session.present, () =>
      playSoundEffect(soundKind)
    );
    if (outcome.session.present.phase === 'won') completeStop(lesson.id);
  };
  const nextPage = () => {
    if (animation.busyRef.current) return;
    if (page === guidedPages.length - 1) {
      setActive(null);
      return;
    }
    const result = interact(guidedLevel, state, guidedActions[page]!);
    if (!result.ok) return;
    if (result.state.phase === 'won') completeStop(GUIDED_STOP);
    setPage((value) => value + 1);
    animation.markBusy();
    animation.start(result, guidedLevel, state);
  };
  return (
    <section
      className={`screen tutorial-screen${active === null ? ' tutorial-screen--menu' : ''}`}
    >
      <header className="tutorial-header">
        <button
          className="icon-button"
          title={t(active === null ? 'tutorial.back' : 'tutorial.menu')}
          onClick={() => (active === null ? onClose() : setActive(null))}
        >
          <ArrowLeft />
        </button>
        <div>
          <p className="daily-eyebrow">
            {t(active === null ? 'tutorial.brand' : 'tutorial.breadcrumb')}
          </p>
          <h1>
            {active === null
              ? t('tutorial.title')
              : guided
                ? t('tutorial.guided.title')
                : lesson && t(`tutorial.lesson.${lesson.id}.title`)}
          </h1>
        </div>
        <button
          className="icon-button"
          title={t('tutorial.close')}
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      {active === null ? (
        <div className="tutorial-menu">
          <div className="tutorial-route">
            <svg
              viewBox={`0 0 1000 ${(routeStops.at(-1)!.row + 1) * 114}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="tutorial-road-edge" d={tutorialRoad} />
              <path className="tutorial-road-bed" d={tutorialRoad} />
              <path className="tutorial-road-dash" d={tutorialRoad} />
            </svg>
            <ol className="tutorial-stops" role="list">
              <li style={{ gridColumn: 1, gridRow: 1 }}>
                <button
                  className={`tutorial-list-item tutorial-list-item--guided${guidedCompleted ? '' : ' action-highlight'}`}
                  onClick={() => select(-1)}
                  aria-current={nextStop === 0 ? 'step' : undefined}
                  aria-description={
                    guidedCompleted ? t('levels.completed') : undefined
                  }
                >
                  <span
                    className="lesson-tile tile tile--player"
                    aria-hidden="true"
                  >
                    <Flag />
                    {nextStop === 0 && <RouteMarker avatarUrl={avatarUrl} />}
                  </span>
                  <span className="tutorial-stop-label">
                    <strong>{t('tutorial.guided.title')}</strong>
                    <small>{t('tutorial.guided.description')}</small>
                  </span>
                  {guidedCompleted && (
                    <Check className="tutorial-stop-check" aria-hidden="true" />
                  )}
                </button>
              </li>
              {lessons.map((item, index) => {
                const [kind, sign] = practiceTiles[item.id] ?? ['player'];
                const stop = routeStops[index + 1]!;
                return (
                  <li
                    key={item.id}
                    style={{
                      gridColumn: stop.column + 1,
                      gridRow: stop.row + 1,
                    }}
                  >
                    <button
                      className="tutorial-list-item"
                      onClick={() => select(index)}
                      aria-current={nextStop === index + 1 ? 'step' : undefined}
                      aria-description={
                        completed.includes(item.id)
                          ? t('levels.completed')
                          : undefined
                      }
                    >
                      <span
                        className={`lesson-tile tile tile--${kind}`}
                        aria-hidden="true"
                      >
                        <span>{`${sign ?? ''}${index + 1}`}</span>
                        {item.id === 'window' && (
                          <span className="lesson-tile-window">6-7</span>
                        )}
                        {nextStop === index + 1 && (
                          <RouteMarker avatarUrl={avatarUrl} />
                        )}
                      </span>
                      <span className="tutorial-stop-label">
                        <strong>{t(`tutorial.lesson.${item.id}.title`)}</strong>
                      </span>
                      {completed.includes(item.id) && (
                        <Check
                          className="tutorial-stop-check"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      ) : level ? (
        <>
          <div className="tutorial-copy" aria-live="polite">
            <p className="daily-eyebrow">
              {guided
                ? t('tutorial.progress', {
                    current: page + 1,
                    total: guidedPages.length,
                  })
                : t('tutorial.practiceLabel')}
            </p>
            {guided ? (
              <div className="tutorial-pages">
                {guidedPages.map((_, index) => (
                  <div
                    key={index}
                    className={
                      index === page
                        ? 'tutorial-page is-current'
                        : 'tutorial-page'
                    }
                    aria-hidden={index !== page}
                  >
                    <h2>{t(`tutorial.guided.page.${index}.title`)}</h2>
                    <p>{t(`tutorial.guided.page.${index}.text`)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>{lesson && t(`tutorial.lesson.${lesson.id}.description`)}</p>
            )}
          </div>
          <PlayerStatus level={level} state={state} />
          <div
            className={`tutorial-board ${guided ? 'tutorial-board--guided' : ''} ${blocked ? `is-blocked is-blocked--${blocked % 2}` : ''}`}
            key={active}
          >
            <BoardStage
              level={level}
              present={state}
              presentation={animation.presentation}
              selectedId={null}
              selectionPath={null}
              focusCells={guided ? selectedPage.focusCells : undefined}
              disabled={
                guided || animation.animating || state.phase !== 'playing'
              }
              flashTileId={animation.flashTileId}
              onSelect={play}
              onClearSelection={() => {}}
              avatarUrl={avatarUrl}
              boardLabel={
                guided
                  ? t('tutorial.guided.title')
                  : lesson && t(`tutorial.lesson.${lesson.id}.title`)
              }
            />
            <p className="board-feedback" role="status">
              {blocked
                ? formatInteractionFailure(
                    translator(t),
                    failureReason,
                    'tutorial.blocked'
                  )
                : !guided && state.phase === 'lost'
                  ? t('tutorial.lost')
                  : !guided && state.phase === 'won'
                    ? t('tutorial.complete')
                    : announcement}
            </p>
          </div>
          {showRule && rule && (
            <AppDialog
              open
              title={ruleTitle}
              describedBy="tutorial-rule-copy"
              className="tutorial-rule-card"
              onCloseAutoFocus={(event) => {
                if (!ruleReturn.current) return;
                event.preventDefault();
                ruleReturn.current.focus();
              }}
            >
              {ruleDemo && (
                <div className="tutorial-rule-demo">
                  <RoutePlayback
                    key={rule}
                    {...ruleDemo}
                    avatarUrl={avatarUrl}
                    boardLabel={ruleTitle}
                    compact
                    loop
                  />
                </div>
              )}
              <p id="tutorial-rule-copy">
                {guided
                  ? t(`tutorial.guided.page.${page}.text`)
                  : lesson && t(`tutorial.lesson.${lesson.id}.description`)}
              </p>
              <button
                type="button"
                className="toolbar-button action-highlight"
                onClick={() => acknowledgeRule(rule)}
              >
                {t('tutorial.gotIt')}
              </button>
            </AppDialog>
          )}
          {showRoute && lesson && (
            <AppDialog
              open={showRoute}
              title={t('tutorial.route')}
              dismissible
              onOpenChange={setShowRoute}
            >
              <RoutePlayback
                key={lesson.id}
                level={lesson.level}
                solution={lesson.solution}
                avatarUrl={avatarUrl}
                boardLabel={t(`tutorial.lesson.${lesson.id}.title`)}
              />
            </AppDialog>
          )}
          <nav className="tutorial-controls">
            {guided ? (
              <>
                <button
                  className="toolbar-button"
                  disabled={page === 0 || animation.animating}
                  onClick={() => {
                    const previous = restoreSession(
                      guidedLevel,
                      guidedActions.slice(0, page - 1)
                    ).present;
                    const forward = interact(
                      guidedLevel,
                      previous,
                      guidedActions[page - 1]!
                    );
                    setPage((value) => value - 1);
                    animation.markBusy();
                    if (forward.ok)
                      animation.start(
                        {
                          ok: true,
                          state: previous,
                          path:
                            forward.event.kind === 'respawn'
                              ? [state.position, previous.position]
                              : [...forward.path].reverse(),
                          event: {
                            kind: 'walk',
                            tileId: 'rewind',
                            playerBefore: state.value,
                            playerAfter: previous.value,
                          },
                        },
                        guidedLevel,
                        state
                      );
                  }}
                >
                  <ArrowLeft />
                  {t('tutorial.previous')}
                </button>
                <button
                  className="toolbar-button action-highlight"
                  ref={ruleReturn}
                  disabled={animation.animating}
                  onClick={nextPage}
                >
                  <ArrowRight />
                  {t(
                    page === guidedPages.length - 1
                      ? 'tutorial.practice'
                      : 'tutorial.next'
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  className="toolbar-button"
                  disabled={!session.actions.length || animation.animating}
                  onClick={() => {
                    setSession(undo(session));
                    setBlocked(0);
                    setAnnouncement('');
                  }}
                >
                  <Undo2 />
                  {t('tutorial.undo')}
                </button>
                <button
                  className="toolbar-button"
                  disabled={animation.animating}
                  onClick={() => {
                    animation.cancel();
                    setSession(createSession(level));
                    setBlocked(0);
                    setAnnouncement('');
                  }}
                >
                  <RotateCcw />
                  {t('tutorial.restart')}
                </button>
                <button
                  className="toolbar-button"
                  ref={ruleReturn}
                  disabled={animation.animating}
                  onClick={() => setShowRoute((value) => !value)}
                >
                  <BookOpen />
                  {t('tutorial.route')}
                </button>
                {state.phase === 'won' && (
                  <button
                    className="toolbar-button"
                    disabled={animation.animating}
                    onClick={() =>
                      active !== null && active < lessons.length - 1
                        ? select(active + 1)
                        : setActive(null)
                    }
                  >
                    <ArrowRight />
                    {t('tutorial.next')}
                  </button>
                )}
              </>
            )}
          </nav>
        </>
      ) : null}
    </section>
  );
}
