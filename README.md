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

The publish leaves out what the shipped app never uses: the API's own `EggsApp.Api.exe` and its runtimeconfig (the
API only runs in-process), `appsettings.Development.json` (the embedded host is always Production), and the packages'
IntelliSense `.xml` files. The `.pdb` files stay, so stack traces in the log have line numbers.

The publish folder isn't what gets installed by hand: the installer wraps it. See
[Instalar y actualizar en la PC de papá](#instalar-y-actualizar-en-la-pc-de-papá).

## Version

The app's version is `<Version>` in `Directory.Build.props`, and only there. It shows at the bottom of the sidebar ("Versión 1.0.0",
bottom left, on every screen), in the startup log line (with the commit: `Started. Version 1.0.0+b21b0da…`), in
`GET /api/health`, in the installer's name and title, and in Windows' list of installed apps.

Bump it in the pull request that changes what gets shipped: patch for fixes, minor for new features, major for
anything that changes how the app is used.

## Instalar y actualizar en la PC de papá

This is for Billy. The installer is per-user (no administrator rights), works offline, and puts the program in
`%LocalAppData%\Programs\Eggs App`. It never touches `%LocalAppData%\EggsApp`, where the data is.

### Building the installer

From a clean checkout, with the .NET SDK, Node.js 24 + pnpm, and Inno Setup 6 (`winget install JRSoftware.InnoSetup`):

```powershell
powershell -ExecutionPolicy Bypass -File installer\build.ps1
```

It publishes the app (UI included), checks the output, and writes `artifacts\installer\EggsApp-Setup-<version>.exe`
(about 55 MB), printing its SHA-256. Alternatively, push a version tag and take the installer from the GitHub Release:
see [Releasing a version](#releasing-a-version).

### Before the first install, on the new PC

1. **Smart App Control.** Open Seguridad de Windows → Control de aplicaciones y del explorador → Smart App Control. If
   it's **Activado** or **Evaluación**, Windows blocks unsigned apps outright, with no way to run them anyway, and the
   installer and the app aren't signed. It has to be **Desactivado** for Eggs App to work.
2. **OneDrive.** Sign in with the account the backups should go to, and leave it set to start with Windows (see
   [Backups](#backups)).
3. **Older copies.** If an app folder was ever copied by hand onto this PC (from earlier tests), delete that folder
   and its shortcuts. Never delete `%LocalAppData%\EggsApp`: that's the data.

### First install

1. Copy `EggsApp-Setup-<version>.exe` to the PC (USB, or download it from the GitHub Release). To be sure it arrived
   intact, compare `Get-FileHash .\EggsApp-Setup-<version>.exe` with the SHA-256 from the build or the Release.
2. Run it. SmartScreen says "Windows protegió su PC": click **Más información**, then **Ejecutar de todas formas**.
   There's no administrator prompt.
3. If it warns that **Microsoft Edge WebView2 Runtime** is missing (it shouldn't on Windows 11), let it finish, then
   install the runtime from the link in the message, with internet, before opening the app.
4. Click **Instalar**, then **Finalizar** with "Abrir Eggs App" checked. The shortcut "Eggs App" is on the desktop and
   in the Start menu.

### Updating

1. Build the new installer, with the bumped version.
2. On the PC, close Eggs App (if it's open, setup asks to close it first and waits; it never closes it on its own).
3. Run the new installer, the same way as the first time. The data, the backups and `settings.json` stay as they are.
   If the new version changes the database, the app copies it to `backups\` before migrating, at its first start.

An older installer than the version installed is refused ("Ya está instalada la versión…"), and nothing changes.

### What to check after installing or updating

- The dark sidebar says **Versión X.Y.Z** at the bottom left. From a distance: "¿qué versión dice abajo a la izquierda?"
- The latest sales, abonos and expenses are there.
- The sidebar shows "Último respaldo: hoy …" and no warning.
- The day's log, `%LocalAppData%\EggsApp\logs\eggsapp-YYYY-MM-DD.log`, has `Started. Version X.Y.Z+…`. After an
  update that changed the database, it also has `Applied migrations: …` and the path of the copy made before them.
- If setup itself failed, its log is `%TEMP%\Setup Log YYYY-MM-DD #NNN.txt`.

### Uninstalling and going back

Configuración → Aplicaciones → Eggs App → Desinstalar removes the program and its shortcuts only. The data in
`%LocalAppData%\EggsApp` stays, and is there again after a reinstall. Deleting the data is never done by the uninstaller;
it would have to be done by hand.

To go back to an older version: uninstall, then install the older one. If the newer version had changed the database,
the older app refuses it at startup ("No se pudo abrir Eggs App. No se borró ningún dato.") and changes nothing. Then
either install the newer version again, or restore the copy made before the migration (see
[Restoring a backup](#restoring-a-backup)), which loses what was entered since.

## Where the app writes

Everything goes under `%LocalAppData%\EggsApp`, never next to the exe:

| Path          | Contents                                                                                |
| ------------- | --------------------------------------------------------------------------------------- |
| `eggs.db`     | The app's data. While the app runs, SQLite also keeps `eggs.db-wal` and `eggs.db-shm` next to it. |
| `eggs.dev.db` | Development data, used by the standalone API and the `dotnet ef` tools                  |
| `backups\daily` | The automatic backups, one per day (`eggs-YYYY-MM-DD.db`). See [Backups](#backups). |
| `backups`     | A copy made before each migration (`eggs-YYYY-MM-DD_HH-mm-ss-fff.db`), the 5 newest kept, and `backup-state.json`, which the sidebar's warnings need. |
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
check tries again. The sidebar shows "Último respaldo: hoy 8:15 a. m." and warns only when:

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

Pull request CI never builds the installer, to stay fast.

### Releasing a version

`.github/workflows/installer.yml` runs `installer\build.ps1` on Windows when a `v*` tag is pushed. It fails if the tag
doesn't match `<Version>`, then creates a GitHub Release with the installer and its SHA-256. Run it by hand
(workflow_dispatch) for a test build, kept only as a workflow artifact.

```sh
git switch main && git pull
git tag v1.0.0 && git push origin v1.0.0
```

Work tracking: Azure Boards.
