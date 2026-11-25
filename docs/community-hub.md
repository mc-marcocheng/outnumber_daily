# Community hub

The hub is a separate post entrypoint (`hub.html`) in the same Devvit app. Daily posts open the puzzle directly. The hub holds the animated introduction, rankings, a puzzle editor and private puzzle submissions.

## Layout

The hub uses a 256-pixel inline post height. Its front page has the animated header, a Play today button and navigation. The header shows the wordmark, with the player token as the first O, and the Game, Leaders and Contribute tabs.

- **Game** shows a guided route animation with pause and replay controls. Play today appears in the middle of the board when the demonstration ends.
- **Leaders** has period and difficulty toggles. The table scrolls while the filters stay visible.
- **Contribute** opens the editor in Reddit's expanded view.
- **Play today** opens the game entrypoint in expanded view, never inside the inline hub.

Game and Leaders stay inline. Expansion is always an explicit action. The editor keeps its draft when you switch tabs, and Back returns to the front page. Header settings reuse the game's display, sound and language controls, and motion preferences disable the button animations. The hub and editor support English, Traditional Chinese, Simplified Chinese and Japanese. Player-written titles are not translated.

## Creating the hub

A moderator chooses **Create community hub highlight** from the subreddit menu. The action creates the post, highlights it and titles it `Outnumber: Daily Numbers Puzzle`. Running it again reuses the saved post when its title matches. A post with a different title is replaced and unhighlighted, not deleted. Deleting the saved post clears the stored link and leaves submissions and daily progress alone.

## Contributions

Authors place tiles, edit values and play their board with the shared game engine. Editing and test-run undo are separate. Changing the board clears the test run and its assessment. Save keeps the draft on the current device. Submitted puzzles are stored in Redis and are visible only to their author and the community moderators.

Submission requires:

- At most 4 columns and 5 rows for Easy, 5 and 6 for Medium, or 6 and 7 for Hard.
- Printed values below 1,000, including the starting value and window surplus. Totals reached during play can exceed this.
- One boss, no overlapping objects, an empty starting cell and connected floor.
- At most two spare lives and 256 recorded actions.
- A replayable winning solution.
- A title of 2 to 32 characters, asked for only when submitting a winning run.

Submit stays disabled until an assessment measures a daily difficulty. A puzzle below daily criteria, or one the analyzer could not finish, cannot be submitted, and the message explains what to change. The server assesses again on submission and rejects ineligible puzzles.

The server takes the author from the trusted Reddit context and recomputes steps. Requests are limited to 24 KB. Each author can keep 10 submissions and can request an assessment or a submission once every 30 seconds. Identical retries return the existing submission. A countdown disables both actions during the wait, and a rate-limit response keeps the winning run, assessment and title so the author can retry. Authors can withdraw their own submissions.

### Assessment

Assessment runs the exact difficulty analyzer on the server with a graph budget of 1,000 states, 8,000 edges and 150 ms, then checks the daily-tier gates. The budget limits graph construction, not the whole HTTP request. Three results are possible:

- A measured difficulty.
- **Below daily criteria**: no daily-tier gate passed. The puzzle is still valid and solvable.
- **Needs review**: the budget ran out. The tool does not guess a rating.

Subtraction and division are optional in contributed puzzles. The generated season requires them.

### Moderator review

Moderators can step through a submitted solution action by action, or play an independent test run with undo and restart. Switching modes keeps the playback position and never changes the submitted proof. Inspection shows the author's target difficulty and the measured one separately.

Declining requires a reason of 1 to 500 characters. The author sees it, and moderators can revisit the Declined tab. Shortlisting a declined puzzle clears its reason. Moderators can copy the full puzzle JSON with author credit.

Shortlisting does not change the daily season. A shortlisted puzzle still needs offline certification, a diversity check and human review before it can appear in a daily post. No solver or hint worker is bundled into the client.

## Rankings

Players are ranked by:

1. Distinct daily puzzles solved, highest first.
2. Sum of best raw steps across those puzzles, lowest first.
3. Sum of milliseconds from release to first validated solve, lowest first.

Players with equal values share a rank, and the next rank skips the tied positions. Filters cover all difficulties or one. Both periods show the top 50.

Release time is 00:00 UTC on the puzzle date, not the Reddit post time. A puzzle identity is the season, date and difficulty, so a board that repeats on another date counts again. A shorter route found later improves the step total without changing the first-solve time. Client clocks and dialog timing are never used. Archive solves are not ranked.

Rankings do not expire. A player's ledger and every affected board are updated in one WATCH transaction, retried up to four times if it aborts. Sorted-set members encode the three ordering fields separately instead of packing them into one floating-point score. The in-game daily leaderboard is separate and expires after 30 days.

Deleting a player's data removes their rankings and submissions. Deleting a daily post subtracts that date from the aggregates and keeps other dates. Close open game tabs before deleting, because further play creates data again.

## Checks

```sh
npm test -- contributions community-ranking community-server community-win puzzle-editor local-community deletion-routes
npm run test:ui
```

The browser suite uses mocked endpoints. It covers draft persistence, test play and undo, assessment cooldowns, rate-limit retries, submission, inspection, decline reasons, withdrawal and ranking filters. It runs all four languages at 320, 600, 700, 724 and 1280 pixels, and checks the 256-pixel inline layout, navigation bounds, expansion targets and draft retention. Reddit's real modal and highlight rendering need a playtest in a test subreddit.
