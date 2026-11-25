# Data and privacy

## What the app stores

Reddit-hosted Redis is scoped to the installed community. The app stores runs, scores, Reddit user IDs, usernames, avatar URLs, last-seen dates and streaks. It does not store comment bodies, collect credentials or send player data to external services.

| Data | Key | Retention |
| --- | --- | --- |
| Runs and personal bests | `season-1:run:<date>:<difficulty>:<userId>` | Until deleted |
| Participant index per date | `season-1:participants:<date>` | Until deleted |
| Dates played per user | `season-1:user-dates:<userId>` | Until deleted |
| Completed dates (streaks) | `season-1:completions:<userId>` | Until deleted |
| Daily leaderboard | `season-1:lb:<date>:<difficulty>` | 30 days after the last write |
| Profile | `user:<userId>` | 30 days after the last update |
| Post-to-date lookup | `post-date:<postId>` | 30 days, no player identity |

Profile expiry does not remove progress. Leaderboard expiry applies to the whole sorted set, so a single entry can outlive 30 days while other players keep updating the same date.

Winning any difficulty on a date counts once toward the shared streak. Runs, bests and leaderboards are kept separately for Easy, Medium and Hard. Community rankings and puzzle submissions are described in [the hub guide](community-hub.md).

## Deleting your data

Use **Delete my Outnumber data** in a post's menu and confirm. This removes your runs, leaderboard entries, profile, indexes, streaks, rankings and submissions in that community. Close other sessions first, because an open game can save data again. Reddit posts and flair are separate. Each installed community needs its own request, and moderators handle account-level requests.

Deleting or removing a post purges that date's runs and leaderboard. If several posts share a date, removing one purges the shared data. The app stores nothing linked to comments, so comment deletion needs no cleanup.

Devvit has no account-deletion trigger. Self-service deletion and expiry do not replace prompt cleanup when an account is deleted, so a process with Reddit is still needed.

## Archive

The archive lists dates from the season start through today for the selected month and difficulty. It returns retained personal status and no puzzle content. Signed-out players can view puzzles but must sign in to save moves, and archive status is never shared between anonymous visitors.

Past puzzles are playable. A past completion verifies the replay and returns an end card with no rank and the current streak. It does not change scores, streaks, profiles or realtime leaderboards.

## Preferences

Appearance, language and motion preferences stay in the browser. Reduced motion follows the device setting and can also be set in Settings.

## Before a public release

- Review the [Devvit Rules](https://developers.reddit.com/docs/devvit_rules) and the custom avatar brand requirements. Loading an image does not grant permission to use it.
- Review the profile-icon SDK patch described in [development](development.md#avatar-sdk-patch).
- Confirm the midnight UTC cron and cross-client leaderboard updates in the hosted environment. Local tests and simulated realtime messages do not prove either.
