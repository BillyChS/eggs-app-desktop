# eggs-app-desktop
Offline desktop app (WPF + WebView2 + React + SQLite) to track sales, credit, and expenses for a small egg business.

Work tracking: Azure Boards.

It tracks cash sales, credit sales, partial payments (abonos), expenses, and summaries in Costa Rican colones.
It runs entirely on the local machine: no cloud, no accounts.

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

**Desktop**:

```sh
dotnet run --project src/EggsApp.Desktop
```

**Build and test**:

```sh
dotnet build
dotnet test
cd src/web && pnpm build
```
