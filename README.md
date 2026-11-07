# eggs-app-desktop

[![Backend CI](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/backend-ci.yml/badge.svg?branch=main)](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/frontend-ci.yml/badge.svg?branch=main)](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/frontend-ci.yml)
[![CodeQL](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/BillyChS/eggs-app-desktop/actions/workflows/github-code-scanning/codeql)

Offline Windows desktop app (WPF + WebView2 + React + SQLite) for a small egg business, built to track cash sales,
credit sales, partial payments (abonos), expenses, and summaries in Costa Rican colones. It runs entirely on the local
machine, with no cloud and no accounts. The project is at the scaffold stage: the desktop shell, the API host with a
health endpoint, the React UI, tests, and CI are in place; the business features are not built yet.

## Architecture

A WPF window hosts WebView2, which shows the React UI. An ASP.NET Core API runs in-process on `127.0.0.1`
and serves both the API (`/api/*`) and the built React files. Data is stored in a local SQLite file.

| Path                    | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `src/EggsApp.Api`       | ASP.NET Core minimal API (.NET 10)                |
| `src/EggsApp.Desktop`   | WPF shell (.NET 10, `net10.0-windows`)            |
| `src/web`               | React + Vite + TypeScript UI (pnpm)               |
| `tests/EggsApp.Tests`   | xUnit tests for the API                           |

## Tech stack

- .NET 10, ASP.NET Core minimal APIs, WPF, WebView2
- SQLite
- React 19, TypeScript, Vite, pnpm
- xUnit

## Prerequisites

- .NET 10 SDK (pinned in `global.json`)
- Node.js 24+ and pnpm
- Windows (for the desktop app)

## Running locally

**API** (standalone, Development mode, Swagger at http://localhost:5080/swagger):

```sh
dotnet run --project src/EggsApp.Api
```

**Web** (Vite dev server; proxies `/api` to http://localhost:5080):

```sh
cd src/web
pnpm install
pnpm dev
```

**Desktop** (shows the last `pnpm build`, so run that first):

```sh
dotnet run --project src/EggsApp.Desktop
```

For day-to-day UI work, run the API and `pnpm dev` together and open the Vite URL: changes hot-reload without a build.

**Build and test**:

```sh
dotnet build
dotnet test
cd src/web && pnpm build
```

## Serving the UI from the API

`pnpm build` writes the UI to `src/EggsApp.Api/wwwroot` (git-ignored, emptied on every build, so nothing hand-written
belongs there). The API then serves it at `/`, with unknown non-`/api` routes falling back to `index.html`. Start or
restart the API after the first `pnpm build`: it only picks up `wwwroot` if the folder exists at startup.

`dotnet build` and `dotnet test` never run pnpm and don't need a built UI.

## Publishing the desktop app

```sh
dotnet publish src/EggsApp.Desktop -p:PublishProfile=win-x64
```

The output in `src/EggsApp.Desktop/bin/publish/win-x64` is self-contained: the target PC needs no .NET runtime, only the
WebView2 runtime, which Windows 11 includes. Publishing builds the UI, which requires Node.js and pnpm. Add
`-p:SkipFrontendBuild=true` to publish the existing `wwwroot` without rebuilding it.

## Where the app writes

Everything goes under `%LocalAppData%\EggsApp`, never next to the exe:

| Path          | Contents                                                                                |
| ------------- | --------------------------------------------------------------------------------------- |
| `eggs.db`     | The app's data. While the app runs, SQLite also keeps `eggs.db-wal` and `eggs.db-shm` next to it. |
| `eggs.dev.db` | Development data, used by the standalone API and the `dotnet ef` tools                  |
| `backups\daily` | The automatic backups, one per day (`eggs-YYYY-MM-DD.db`). See [Backups](#backups). |
| `backups`     | A copy made before each migration (`eggs-YYYY-MM-DD_HH-mm-ss-fff.db`), the 5 newest kept, and `backup-state.json`, which the footer's warnings need. |
| `settings.json` | Optional, written by hand: the backup's second location. See [Backups](#backups).  |
| `WebView2`    | WebView2 user data                                                                      |
| `logs`        | One line per startup (version and port), clean shutdown and backup, plus failures and unhandled exceptions. One file per day, kept for 7 days. The Spanish error messages show this path. |

The one exception is the second copy of each backup, which goes off this folder on purpose: by default to
`%OneDrive%\Respaldos Eggs App`.

## Backups

The desktop app backs up `eggs.db` on its own; nobody has to do anything. The standalone API never does.

**When.** At startup, if there's no backup for today yet (in the background, so the window doesn't wait); every hour
while open, for the same reason, so an app left open past midnight still gets the new day's; and on every clean
close, which replaces today's file with the day's final state.

**How.** SQLite's backup API (never a file copy, which could miss what's still in `eggs.db-wal`) writes
`eggs-YYYY-MM-DD.db.partial`. The copy is checked with `PRAGMA integrity_check`, and only then renamed, so a file with
its real name is always a complete, valid database. Backups are single files in rollback-journal mode: no `-wal` or
`-shm` goes with them.

**What's kept.** The 14 newest daily backups, plus the newest of each of the 12 newest months: about a year, a couple
of MB. Counted in backups, not calendar days, so an app left unused for weeks doesn't lose its old ones. The 5 newest
pre-migration copies are kept too. Pruning only deletes files whose names match those patterns.

**Second location.** Each verified backup is also copied to a second folder, with the same retention:

- Default: `%OneDrive%\Respaldos Eggs App`, when OneDrive is set up for the Windows user (the `OneDrive` environment
  variable). OneDrive syncs it to the cloud, which covers a dead disk or a stolen PC, and its version history and
  Files Restore (30 days) help against ransomware. The app only sees the local folder: it can't tell if OneDrive is
  signed in and syncing, so check now and then at onedrive.live.com that `Respaldos Eggs App` has recent files.
- Another folder, like a USB drive, or none: create `%LocalAppData%\EggsApp\settings.json`:

  ```json
  { "Backup": { "SecondFolder": "E:\\Respaldos Eggs App" } }
  ```

  Use `"off"` for no second copy. The folder is created if its parent exists. If it doesn't (USB unplugged), the copy
  is skipped and logged, and made at the next hourly check. A `settings.json` with a mistake is logged and ignored;
  it never stops the app.

**Installing on a new PC.** Sign in to OneDrive with the account the backups should go to, and leave it set to start
with Windows. Open the app once, then check that `Respaldos Eggs App` shows up in OneDrive online.

**Failures.** A failed backup never stops the app or touches `eggs.db`: it's logged with the reason, and the next
check tries again. The footer shows "Último respaldo: hoy 8:15 a. m." and warns only when:

- the most recent attempt failed (remembered across restarts in `backup-state.json`), or
- the app was used on 3 days with no good backup since. Days it wasn't opened don't count, so a long weekend never
  causes a warning.

The second copy has the same rule with 7 days of use, and a skipped copy (no OneDrive, USB unplugged) counts as days
without one, not as a failure. A warning has one button, "Intentar de nuevo", which runs a backup at once
(`POST /api/backups`).

## Restoring a backup

This is for Billy, not for the person using the app. Nothing is ever deleted until the end.

1. **Close Eggs App.** In Task Manager, check that no `EggsApp.Desktop` process is left.
2. **Choose the backup.** The newest is in `%LocalAppData%\EggsApp\backups\daily`, named by day. If the PC's disk is
   gone, take one from OneDrive's `Respaldos Eggs App` (download it first, so it isn't just a cloud placeholder).
   To restore the state before a migration, take a `backups\eggs-YYYY-MM-DD_HH-mm-ss-fff.db` instead.
3. **Move the current database aside.** In `%LocalAppData%\EggsApp`, create a folder like
   `before-restore-2026-11-07` and move `eggs.db` into it, **together with `eggs.db-wal` and `eggs.db-shm` if they
   exist**. A leftover `-wal` next to the restored file would be applied to it and corrupt it.
4. **Put the backup in place.** Copy (don't move) the chosen backup into `%LocalAppData%\EggsApp` and rename the copy
   to `eggs.db`.
5. **Open Eggs App** and check the latest sales, abonos and expenses. A backup from an older version of the app is
   migrated at startup, after a copy of it is made. One from a newer version is refused with an error, and nothing is
   changed: use the newer app.
6. **When it's all right**, delete the `before-restore-…` folder. If not, close the app and put those files back.

Restoring doesn't remove later backups: the next one is made from the restored data, and today's file is replaced
when the app closes. To keep today's original, copy it somewhere first.

## CI

Pull requests run `.github/workflows/ci.yml`. It detects which parts changed and calls Backend CI
(Windows: restore, build with `-warnaserror`, test) and/or Frontend CI (Ubuntu: pnpm install, lint, build).
The `ci-gate` job always reports: it passes when every job that ran passed (skipped jobs are fine) and fails
otherwise, so it is the single status check to require on `main`. Pushes to `main` run Backend CI and Frontend CI
directly. CodeQL uses GitHub's default code scanning setup. Dependabot opens weekly grouped updates.

Work tracking: Azure Boards.
