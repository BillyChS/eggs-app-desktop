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

| Folder     | Contents                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| `WebView2` | WebView2 user data                                                                         |
| `logs`     | One line per startup (version and port) and clean shutdown, plus startup failures and unhandled exceptions. One file per day, kept for 7 days. The Spanish error messages show this path. |

## CI

Pull requests run `.github/workflows/ci.yml`. It detects which parts changed and calls Backend CI
(Windows: restore, build with `-warnaserror`, test) and/or Frontend CI (Ubuntu: pnpm install, lint, build).
The `ci-gate` job always reports: it passes when every job that ran passed (skipped jobs are fine) and fails
otherwise, so it is the single status check to require on `main`. Pushes to `main` run Backend CI and Frontend CI
directly. CodeQL uses GitHub's default code scanning setup. Dependabot opens weekly grouped updates.

Work tracking: Azure Boards.
