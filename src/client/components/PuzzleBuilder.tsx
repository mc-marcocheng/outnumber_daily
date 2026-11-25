import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import {
  ArrowUpFromLine,
  Check,
  Crown,
  Divide,
  Equal,
  Eraser,
  Heart,
  Info,
  History,
  Home,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Save,
  Scan,
  Send,
  Square,
  Undo2,
  UserRound,
  X,
} from 'lucide-react';
import {
  compileLevel,
  rawLevelSchema,
  type RawLevel,
} from '../../shared/game/level-schema';
import type { Level } from '../../shared/game/model';
import {
  commitInteraction,
  createSession,
  undo,
  type Session,
} from '../../shared/game/session';
import { replayWithSteps } from '../../shared/replay';
import {
  contributionLimits,
  validateContribution,
  type ContributionAssessment,
  type ContributionInput,
} from '../../shared/contributions';
import {
  newDraft,
  paintCell,
  resizeDraft,
  type EditorTool,
} from '../app/puzzle-editor';
import { CommunityRequestError, communityRequest } from '../app/community-api';
import { GameBoard } from './GameBoard';
import { DifficultySelector } from './DifficultySelector';
import { AppDialog } from './AppDialog';
import { useTranslation } from 'react-i18next';

function ValueControl({
  label,
  value,
  min = 1,
  max = 999,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="builder-value-control">
      <span>{label}</span>
      <div className="builder-stepper">
        <button
          type="button"
          title={`${label}: -1`}
          aria-label={`${label}: -1`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus size={16} />
        </button>
        <input
          aria-label={label}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isInteger(next) && next >= min && next <= max)
              onChange(next);
          }}
        />
        <button
          type="button"
          title={`${label}: +1`}
          aria-label={`${label}: +1`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

const draftKey = 'outnumber-community-draft';
const draftSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']),
  level: rawLevelSchema.extend({ tiles: rawLevelSchema.shape.tiles.min(0) }),
});
const tools = [
  { id: 'floor', label: 'Floor', icon: Eraser },
  { id: 'wall', label: 'Wall', icon: Square },
  { id: 'start', label: 'Start', icon: Home },
  { id: 'enemy', label: 'Enemy', icon: UserRound },
  { id: 'window', label: 'Window enemy', icon: Scan },
  { id: 'boss', label: 'Boss', icon: Crown },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'subtract', label: 'Subtract', icon: Minus },
  { id: 'multiply', label: 'Multiply', icon: X },
  { id: 'divide', label: 'Divide', icon: Divide },
  { id: 'set', label: 'Set', icon: Equal },
] satisfies { id: EditorTool; label: string; icon: typeof Plus }[];

function loadDraft(): z.infer<typeof draftSchema> {
  try {
    const parsed = draftSchema.safeParse(
      JSON.parse(localStorage.getItem(draftKey) ?? 'null')
    );
    if (parsed.success) return parsed.data;
  } catch {
    return { difficulty: 'easy', level: newDraft() };
  }
  return { difficulty: 'easy', level: newDraft() };
}

export function Assessment({ value }: { value: ContributionAssessment }) {
  const { t } = useTranslation();
  return (
    <dl className="builder-assessment">
      <div>
        <dt>{t('Measured difficulty')}</dt>
        <dd
          className={
            value.status !== 'assessed' || !value.difficulty
              ? 'builder-violation'
              : undefined
          }
        >
          {value.status === 'needs-review'
            ? t('Needs review')
            : value.difficulty
              ? t(`difficulty.${value.difficulty}`)
              : t('Below daily criteria')}
        </dd>
      </div>
      {value.minimumActions !== null && (
        <div>
          <dt>{t('Minimum actions')}</dt>
          <dd>{value.minimumActions}</dd>
        </div>
      )}
      {value.meaningfulForks !== null && (
        <div>
          <dt>{t('Decisions on every winning route')}</dt>
          <dd>{value.meaningfulForks}</dd>
        </div>
      )}
    </dl>
  );
}

export function PuzzleBuilder({
  signedIn,
  onSubmitted,
  onShowSubmissions,
  onShowLimits,
  hidden = false,
}: {
  signedIn: boolean;
  onSubmitted: () => void;
  onShowSubmissions: () => void;
  onShowLimits: () => void;
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(loadDraft);
  const [history, setHistory] = useState<RawLevel[]>([]);
  const [tool, setTool] = useState<EditorTool>('floor');
  const [value, setValue] = useState(2);
  const [surplus, setSurplus] = useState(1);
  const [test, setTest] = useState<{ level: Level; session: Session } | null>(
    null
  );
  const [assessment, setAssessment] = useState<ContributionAssessment | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= cooldownUntil) setCooldownUntil(0);
    }, 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);
  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState(280);
  const boardRef = useRef<HTMLDivElement>(null);
  const modeId = useId();
  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { level, difficulty } = draft;
  const limits = contributionLimits[difficulty];
  const cellSize = Math.max(
    24,
    Math.min(58, Math.floor((width - 40 - (level.width - 1) * 6) / level.width))
  );
  const numericTool = !['floor', 'wall', 'start'].includes(tool);
  const canSubmit =
    signedIn &&
    !busy &&
    !waitSeconds &&
    test?.session.present.phase === 'won' &&
    assessment?.status === 'assessed' &&
    assessment.difficulty !== null;
  const submissionGuidance = assessment
    ? assessment.status === 'needs-review'
      ? 'Assessment could not measure this puzzle. Revise the board, finish a new test run, and assess again before submitting.'
      : !assessment.difficulty
        ? 'This puzzle is below daily criteria. Add meaningful choices, finish a new test run, and assess again before submitting.'
        : ''
    : messageError
      ? 'Fix the issue above, then assess again.'
      : test?.session.present.phase === 'won'
        ? 'Assess this puzzle before submitting. It must meet daily criteria.'
        : '';

  function edit(next: RawLevel) {
    if (next === level) return;
    setHistory((previous) => [...previous.slice(-49), level]);
    setDraft({ ...draft, level: next });
    setTest(null);
    setAssessment(null);
    setMessage('');
    setMessageError(false);
  }
  function beginTest() {
    try {
      const compiled = compileLevel(level);
      setTest({ level: compiled, session: createSession(compiled) });
      setAssessment(null);
      setMessage('');
    } catch {
      setMessageError(true);
      setMessage(
        'Place one boss and keep every tile on a floor cell away from the start.'
      );
    }
  }
  function play(id: string) {
    if (!test || test.session.actions.length >= 256) return;
    const result = commitInteraction(test.level, test.session, id);
    if (!result.result.ok) {
      setMessageError(true);
      setMessage(
        result.result.reason === 'non-integer-result'
          ? 'Division must give a whole number.'
          : result.result.reason === 'non-positive-result'
            ? 'Subtraction must leave at least 1.'
            : 'That move is blocked.'
      );
      return;
    }
    setTest({ ...test, session: result.session });
    setAssessment(null);
    setMessage('');
    setMessageError(false);
  }
  async function send(kind: 'assess' | 'submit') {
    if (!test || busy || waitSeconds || (kind === 'submit' && !canSubmit))
      return;
    setBusy(true);
    setMessage('');
    setMessageError(false);
    try {
      const input: ContributionInput = {
        ...draft,
        level: {
          ...level,
          title: kind === 'submit' ? title.trim() : level.title,
        },
        actions: [...test.session.actions],
      };
      if (level.width > limits.width || level.terrain.length > limits.height) {
        setMessageError(true);
        setMessage(
          t(
            'This board exceeds the {{level}} limit ({{width}} x {{height}}).',
            {
              level: t(`difficulty.${difficulty}`),
              width: limits.width,
              height: limits.height,
            }
          )
        );
        return;
      }
      validateContribution(input);
      if (kind === 'assess') {
        const result = await communityRequest<{
          assessment: ContributionAssessment;
        }>('/assess', input);
        setAssessment(result.assessment);
      } else {
        await communityRequest('/submit', input);
        setMessage('Submitted privately for moderator review.');
        setDraft({ ...draft, level: input.level });
        setNaming(false);
        onSubmitted();
      }
      const next = Date.now();
      setNow(next);
      setCooldownUntil(next + 30_000);
    } catch (error) {
      if (error instanceof CommunityRequestError && error.retryAfterSeconds) {
        const next = Date.now();
        setNow(next);
        setCooldownUntil(next + error.retryAfterSeconds * 1000);
      } else {
        setAssessment(null);
      }
      setMessageError(true);
      setMessage(
        error instanceof z.ZodError
          ? 'Use a title of 2 to 32 characters and check the number fields.'
          : error instanceof Error
            ? error.message
            : 'Request failed.'
      );
    } finally {
      setBusy(false);
    }
  }
  function save() {
    setMessageError(false);
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setMessage('Draft saved on this device.');
    } catch {
      setMessageError(true);
      setMessage('This browser could not save the draft.');
    }
  }

  return (
    <section
      className="puzzle-builder"
      aria-label={t('Puzzle builder')}
      hidden={hidden}
    >
      <fieldset disabled={busy} className="builder-fields">
        <div className="builder-heading">
          <h2>{t('Build a puzzle')}</h2>
          <button
            type="button"
            className="icon-button"
            title={t('Submission limits')}
            aria-label={t('Submission limits')}
            onClick={onShowLimits}
          >
            <Info size={22} />
          </button>
          <button
            type="button"
            title={t('Submissions')}
            className="icon-button"
            aria-label={t('Submissions')}
            onClick={onShowSubmissions}
          >
            <History size={22} />
          </button>
          <button
            type="button"
            title={t('Save draft on this device')}
            className="icon-button"
            aria-label={t('Save draft')}
            onClick={save}
          >
            <Save size={19} />
          </button>
        </div>
        <div className="builder-target archive-toolbar">
          <span>{t('Target level')}</span>
          <DifficultySelector
            value={difficulty}
            onChange={(next) => {
              setDraft({ ...draft, difficulty: next });
              setAssessment(null);
              setMessage('');
            }}
          />
        </div>
        <div className="builder-mode" role="group" aria-label={t('Board mode')}>
          <fieldset className="builder-mode-toggle">
            <legend className="sr-only">{t('Board mode')}</legend>
            <label>
              <input
                type="radio"
                name={modeId}
                checked={!test}
                onChange={() => {
                  setTest(null);
                  setMessage('');
                }}
              />
              <span>{t('Edit')}</span>
            </label>
            <label>
              <input
                type="radio"
                name={modeId}
                checked={Boolean(test)}
                onChange={beginTest}
              />
              <span>
                <Play size={16} />
                {t('Test')}
              </span>
            </label>
          </fieldset>
          <button
            type="button"
            title={t(test ? 'Undo move' : 'Undo edit')}
            aria-label={t(test ? 'Undo move' : 'Undo edit')}
            disabled={test ? !test.session.past.length : !history.length}
            onClick={() => {
              if (test) {
                setTest({ ...test, session: undo(test.session) });
                setAssessment(null);
              } else {
                const previous = history.at(-1);
                if (previous) {
                  setDraft({ ...draft, level: previous });
                  setHistory(history.slice(0, -1));
                  setAssessment(null);
                }
              }
              setMessage('');
            }}
          >
            <Undo2 size={18} />
          </button>
          {test && (
            <button
              type="button"
              title={t('Restart test')}
              aria-label={t('Restart test')}
              onClick={beginTest}
            >
              <RotateCcw size={18} />
            </button>
          )}
        </div>
        <div className="builder-workspace">
          {!test && (
            <div className="builder-tools">
              <div
                className="builder-palette"
                role="group"
                aria-label={t('Tile tools')}
              >
                {tools.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    aria-label={t(label)}
                    title={t(label)}
                    aria-pressed={tool === id}
                    onClick={() => setTool(id)}
                  >
                    <Icon size={20} />
                    {tool === id && <span aria-hidden="true">{t(label)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="builder-board-space" ref={boardRef}>
            {!test && (
              <div className="builder-player-controls">
                {(tool === 'start' || numericTool) && (
                  <ValueControl
                    label={t(
                      tool === 'start' ? 'Starting value' : 'Tile value'
                    )}
                    value={
                      tool === 'start'
                        ? Number(level.startValue)
                        : tool === 'multiply' || tool === 'divide'
                          ? Math.min(9, Math.max(2, value))
                          : value
                    }
                    min={tool === 'multiply' || tool === 'divide' ? 2 : 1}
                    max={tool === 'multiply' || tool === 'divide' ? 9 : 999}
                    onChange={(next) =>
                      tool === 'start'
                        ? edit({ ...level, startValue: String(next) })
                        : setValue(next)
                    }
                  />
                )}
                {tool === 'window' && (
                  <ValueControl
                    label={t('Max surplus')}
                    value={surplus}
                    onChange={setSurplus}
                  />
                )}
                <div
                  className="builder-lives"
                  role="group"
                  aria-label={t('Spare lives')}
                >
                  <span>{t('Spare lives')}</span>
                  <div>
                    {[1, 2].map((count) => (
                      <button
                        type="button"
                        key={count}
                        aria-label={t('Spare life {{count}}', { count })}
                        title={t('Spare life {{count}}', { count })}
                        aria-pressed={level.spareLives >= count}
                        onClick={() =>
                          edit({
                            ...level,
                            spareLives:
                              level.spareLives === count ? count - 1 : count,
                          })
                        }
                      >
                        <Heart
                          size={22}
                          fill={
                            level.spareLives >= count ? 'currentColor' : 'none'
                          }
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {test ? (
              <>
                <div className="builder-test-status">
                  <span>
                    {t('game.you')} {test.session.present.value.toString()}
                  </span>
                  <span>
                    <Heart size={14} /> {test.session.present.spareLives}
                  </span>
                  <span>
                    {t('{{count}} steps', {
                      count: replayWithSteps(test.level, test.session.actions)
                        .steps,
                    })}
                  </span>
                </div>
                <GameBoard
                  level={test.level}
                  state={test.session.present}
                  selectedId={null}
                  path={null}
                  cellSize={cellSize}
                  disabled={busy || test.session.present.phase !== 'playing'}
                  hidePlayer={false}
                  flashTileId={null}
                  onSelect={play}
                  onClearSelection={() => {}}
                  avatarUrl={null}
                />
                <p className="builder-test-result" role="status">
                  {test.session.present.phase === 'won' ? (
                    <>
                      <Check size={18} />
                      {t('Solved')}
                    </>
                  ) : test.session.present.phase === 'lost' ? (
                    t('No lives left. Undo or restart.')
                  ) : test.session.actions.length >= 256 ? (
                    t('Test limit reached. Undo or restart.')
                  ) : (
                    ''
                  )}
                </p>
              </>
            ) : (
              <div className="builder-board-edit">
                <div
                  className="builder-grid"
                  role="group"
                  aria-label={t('Editable puzzle board')}
                  style={{
                    gridTemplateColumns: `repeat(${level.width}, minmax(0, 1fr))`,
                    maxWidth: level.width * cellSize + (level.width - 1) * 6,
                  }}
                >
                  {level.terrain.flatMap((row, rowIndex) =>
                    [...row].map((terrain, column) => {
                      const cell = rowIndex * level.width + column;
                      const tile = level.tiles.find(
                        (item) => item.cell === cell
                      );
                      const isStart = cell === level.startCell;
                      const kind = isStart
                        ? 'start'
                        : (tile?.kind ?? (terrain === '#' ? 'wall' : 'floor'));
                      const prefix =
                        tile?.kind === 'add'
                          ? '+'
                          : tile?.kind === 'subtract'
                            ? '-'
                            : tile?.kind === 'multiply'
                              ? 'x'
                              : tile?.kind === 'divide'
                                ? '/'
                                : tile?.kind === 'set'
                                  ? '='
                                  : '';
                      const text = isStart
                        ? level.startValue
                        : tile
                          ? `${prefix}${'value' in tile ? tile.value : tile.amount}`
                          : '';
                      return (
                        <button
                          type="button"
                          key={cell}
                          className={`builder-cell builder-cell--${kind}`}
                          aria-label={t(
                            'Row {{row}}, column {{column}}: {{kind}}{{value}}',
                            {
                              row: rowIndex + 1,
                              column: column + 1,
                              kind: t(`tileKind.${kind}`, {
                                defaultValue: kind,
                              }),
                              value: text ? ` ${text}` : '',
                            }
                          )}
                          onClick={() =>
                            edit(
                              paintCell(
                                level,
                                cell,
                                tool,
                                tool === 'multiply' || tool === 'divide'
                                  ? Math.min(9, Math.max(2, value))
                                  : value,
                                surplus
                              )
                            )
                          }
                        >
                          {isStart ? (
                            <Home size={13} />
                          ) : tile?.kind === 'boss' ? (
                            <Crown size={13} />
                          ) : tile?.kind === 'enemy' && tile.maxSurplus ? (
                            <Scan size={13} />
                          ) : null}
                          <span>{text}</span>
                          {tile?.kind === 'enemy' && tile.maxSurplus && (
                            <small>+{tile.maxSurplus}</small>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                <div
                  className="builder-column-controls"
                  role="group"
                  aria-label={t('Columns')}
                >
                  <button
                    type="button"
                    title={t('Remove column')}
                    aria-label={t('Remove column')}
                    disabled={level.width <= 2}
                    onClick={() =>
                      edit(
                        resizeDraft(
                          level,
                          level.width - 1,
                          level.terrain.length
                        )
                      )
                    }
                  >
                    <Minus size={18} />
                  </button>
                  <span>{level.width}</span>
                  <button
                    type="button"
                    title={t('Add column')}
                    aria-label={t('Add column')}
                    disabled={level.width >= limits.width}
                    onClick={() =>
                      edit(
                        resizeDraft(
                          level,
                          level.width + 1,
                          level.terrain.length
                        )
                      )
                    }
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <div
                  className="builder-row-controls"
                  role="group"
                  aria-label={t('Rows')}
                >
                  <button
                    type="button"
                    title={t('Remove row')}
                    aria-label={t('Remove row')}
                    disabled={level.terrain.length <= 1}
                    onClick={() =>
                      edit(
                        resizeDraft(
                          level,
                          level.width,
                          level.terrain.length - 1
                        )
                      )
                    }
                  >
                    <Minus size={18} />
                  </button>
                  <span>{level.terrain.length}</span>
                  <button
                    type="button"
                    title={t('Add row')}
                    aria-label={t('Add row')}
                    disabled={level.terrain.length >= limits.height}
                    onClick={() =>
                      edit(
                        resizeDraft(
                          level,
                          level.width,
                          level.terrain.length + 1
                        )
                      )
                    }
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="builder-actions">
          <button
            type="button"
            disabled={
              !signedIn ||
              Boolean(waitSeconds) ||
              test?.session.present.phase !== 'won'
            }
            onClick={() => void send('assess')}
          >
            <ArrowUpFromLine size={17} />
            {t('Assess')}
          </button>
          <button
            type="button"
            className="hub-primary"
            disabled={!canSubmit}
            onClick={() => {
              setTitle(
                (previous) =>
                  previous ||
                  (level.title === newDraft().title ? '' : level.title)
              );
              setNaming(true);
            }}
          >
            <Send size={17} />
            {t('Submit')}
          </button>
        </div>
      </fieldset>
      {busy && <p role="status">{t('Checking puzzle...')}</p>}
      {waitSeconds > 0 && (
        <p className="builder-cooldown" role="status">
          {t('Next request in {{seconds}} seconds.', { seconds: waitSeconds })}
        </p>
      )}
      {message && (
        <p
          className={`hub-message${messageError ? ' builder-violation' : ''}`}
          role={messageError ? 'alert' : 'status'}
        >
          {t(message, {
            defaultValue: t('Check the puzzle fields and solution.'),
          })}
        </p>
      )}
      {!signedIn && (
        <p className="hub-message">
          {t('Sign in to request assessment or submit.')}
        </p>
      )}
      {assessment && <Assessment value={assessment} />}
      {submissionGuidance && !waitSeconds && (
        <blockquote
          className={`hub-message${assessment || messageError ? ' builder-violation' : ''}`}
          role="status"
        >
          {t(submissionGuidance)}
        </blockquote>
      )}
      <AppDialog
        open={naming}
        title={t('Submit puzzle')}
        dismissible
        onOpenChange={setNaming}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && title.trim().length >= 2) void send('submit');
          }}
        >
          <label className="builder-title-prompt">
            {t('Puzzle title')}
            <input
              aria-label={t('Puzzle title')}
              autoFocus
              minLength={2}
              maxLength={32}
              required
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <button
            className="toolbar-button"
            type="submit"
            disabled={!canSubmit || title.trim().length < 2}
          >
            <Send size={18} />
            {t('Submit')}
          </button>
        </form>
      </AppDialog>
    </section>
  );
}
