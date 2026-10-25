# CLAUDE.md

Offline Windows desktop app for a small egg business: a single, elderly, non-technical user.
It tracks cash sales, credit sales, partial payments (abonos), expenses, and summaries in Costa Rican colones.
There is no cloud and no authentication.

## Architecture

WPF window → WebView2 → React UI. An ASP.NET Core API runs in-process on `127.0.0.1` and serves both
`/api/*` and the built React files from `wwwroot`. Data lives in a local SQLite file.

## Project map

```
src/
  EggsApp.Api/                 ASP.NET Core minimal API (.NET 10)
    EggsAppHostExtensions.cs   AddEggsApp() / UseEggsApp(): host setup shared by standalone and desktop
    Program.cs                 Standalone dev host (Swagger in Development only)
    Features/<Feature>/        Vertical slices (e.g. Features/Health/HealthEndpoint.cs)
    wwwroot/                   React build output (git-ignored)
  EggsApp.Desktop/             WPF shell (net10.0-windows); hosts the API in-process + WebView2
    Assets/app.ico             Application and window icon
  web/                         React + Vite + TypeScript (pnpm)
    src/services/              API calls
    vite.config.ts             Dev proxy: /api → http://localhost:5080
tests/
  EggsApp.Tests/               xUnit; integration tests via WebApplicationFactory<Program>
Directory.Build.props          Nullable, ImplicitUsings, TreatWarningsAsErrors
global.json                    Pins .NET 10 SDK
```

The API dev URL is `http://localhost:5080` (`src/EggsApp.Api/Properties/launchSettings.json`).
The Vite proxy target must match it exactly.

All API routes go under the `/api` route group created in `UseEggsApp()`. Register new feature endpoints there.

## Commands

```sh
dotnet build                               # must produce zero warnings
dotnet test
dotnet run --project src/EggsApp.Api       # Swagger: http://localhost:5080/swagger
dotnet run --project src/EggsApp.Desktop
cd src/web && pnpm dev | pnpm build | pnpm lint
```

## Rules

- **Language:** UI text in Spanish. Code, comments, commits, and docs in English.
- **Zero warnings:** `TreatWarningsAsErrors` is on. Fix warnings; don't suppress them.
- **Dates:** use `DateTime.Now` (local Costa Rica time), never `UtcNow`. The frontend sends dates as local
  `YYYY-MM-DD` strings, never `toISOString()`.
- **Money:** stored as `long` (whole colones). Never `decimal` in entities, because SQLite cannot aggregate decimal.
- **Primary keys:** `Guid`, generated in code.
- **Entities:** every entity has `CreatedAt`, `UpdatedAt`, `IsDeleted`. Deletes are soft deletes.
- **Backend:** Vertical Slice Architecture. Build order: Command → Validator → Handler → Entity → Endpoint → Migration.
- **Frontend:** build order: Screen → Service/Hook → State.
- **UX for an elderly user:** large targets, 18px+ text, at most 2–3 actions per screen, confirmation dialogs.
- **Commits:** Conventional Commits with a footer `Refs: AB#<id>` (Azure Boards).
- **Data safety:** never commit `.db` files or backup JSON files.
