import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
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
import { useInteractionAnimation } from '../presentation/useInteractionAnimation';
import { useMediaQuery } from '../app/useMediaQuery';
import { interact } from '../../shared/game/engine';
import { AppDialog } from '../components/AppDialog';
import { RoutePlayback } from '../tutorials/RoutePlayback';
import { playSoundEffect, unlockSoundEffects } from '../app/sound-effects';
import { formatInteractionFailure } from '../components/interaction-failure';
import { formatAnnouncement } from '../components/game-event-announcement';

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
  const [completed, setCompleted] = useState<readonly string[]>([]);
  const [guidedCompleted, setGuidedCompleted] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animation = useInteractionAnimation({
    reducedMotion,
    onSettled: (event) => setAnnouncement(formatAnnouncement(t, event)),
  });
  const guided = active === -1;
  const lesson = active !== null && active >= 0 ? lessons[active] : undefined;
  const level = guided ? guidedLevel : lesson?.level;
  const state = guided
    ? restoreSession(guidedLevel, guidedActions.slice(0, page)).present
    : session.present;
  const selectedPage = guidedPages[page]!;
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
    if (outcome.session.present.phase === 'won')
      setCompleted((values) =>
        values.includes(lesson.id) ? values : [...values, lesson.id]
      );
  };
  const nextPage = () => {
    if (animation.busyRef.current) return;
    if (page === guidedPages.length - 1) {
      setActive(null);
      return;
    }
    const result = interact(guidedLevel, state, guidedActions[page]!);
    if (!result.ok) return;
    if (result.state.phase === 'won') setGuidedCompleted(true);
    setPage((value) => value + 1);
    animation.markBusy();
    animation.start(result, guidedLevel, state);
  };
  return (
    <section className="screen tutorial-screen">
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
          <button
            className={`tutorial-list-item tutorial-list-item--guided${guidedCompleted ? '' : ' action-highlight'}`}
            onClick={() => select(-1)}
          >
            <BookOpen />
            <span>
              <strong>{t('tutorial.guided.title')}</strong>
              <small>{t('tutorial.guided.description')}</small>
            </span>
            {guidedCompleted ? <Check /> : <ArrowRight />}
          </button>
          <h2>{t('tutorial.practice')}</h2>
          {lessons.map((item, index) => (
            <button
              key={item.id}
              className="tutorial-list-item"
              onClick={() => select(index)}
            >
              <span className="lesson-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>
                <strong>{t(`tutorial.lesson.${item.id}.title`)}</strong>
              </span>
              {completed.includes(item.id) ? <Check /> : <ArrowRight />}
            </button>
          ))}
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
                ? formatInteractionFailure(t, failureReason, 'tutorial.blocked')
                : !guided && state.phase === 'lost'
                  ? t('tutorial.lost')
                  : !guided && state.phase === 'won'
                    ? t('tutorial.complete')
                    : announcement}
            </p>
          </div>
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
