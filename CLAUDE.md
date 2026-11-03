# CLAUDE.md

Offline Windows desktop app for a small egg business: a single, elderly, non-technical user.
It tracks cash sales, credit sales, partial payments (abonos), expenses, and summaries in Costa Rican colones.
There is no cloud and no authentication.

## Architecture

WPF window → WebView2 → React UI. An ASP.NET Core API runs in-process on `127.0.0.1` and serves both
`/api/*` and the built React files from `wwwroot`. Data lives in a local SQLite file.

The port is chosen by the OS at each startup, so the page's origin changes on every launch.

## Project map

```
src/
  EggsApp.Api/                 ASP.NET Core minimal API (.NET 10)
    EggsAppHostExtensions.cs   AddEggsApp() / UseEggsApp(): host setup shared by standalone and desktop
    Program.cs                 Standalone dev host (Swagger in Development only)
    Hosting/                   EmbeddedApiHost (in-process host), FailureLog, AppDataPaths
    Data/                      AppDbContext, BaseEntity, DatabaseMigrator (startup migration)
    Data/Migrations/           EF Core migrations
    Features/<Feature>/        Vertical slices (e.g. Features/Health/HealthEndpoint.cs)
    wwwroot/                   React build output (git-ignored)
  EggsApp.Desktop/             WPF shell (net10.0-windows); hosts the API in-process + WebView2
    App.xaml.cs                Startup order, shutdown, failure handling
    MainWindow.xaml.cs         WebView2 setup and navigation rules
    SingleInstance.cs          One running copy; a second launch focuses it
    UiText.cs                  Spanish text of the desktop shell
    Assets/app.ico             Application and window icon
  Frontend.targets             Builds the UI and adds it to the publish output of the API and Desktop
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
cd src/web && pnpm dev | pnpm build | pnpm lint   # pnpm build writes to src/EggsApp.Api/wwwroot
dotnet publish src/EggsApp.Desktop -p:PublishProfile=win-x64   # the shipped app: self-contained, includes the UI
```

Publishing builds the UI; `-p:SkipFrontendBuild=true` publishes `wwwroot` as is. In Debug, the desktop app uses
`src/EggsApp.Api/wwwroot`, so run `pnpm build` first.

### Migrations

```sh
dotnet tool restore                        # once per clone; installs the pinned dotnet-ef
dotnet ef migrations add <Name> --project src/EggsApp.Api --output-dir Data/Migrations
```

Migrations apply automatically at startup, before the host listens, so there's no `database update` step. If the
database has data and migrations are pending, it's first copied to `backups\`. A failure stops the app.

The desktop app uses `eggs.db`. The standalone API and the `dotnet ef` tools use `eggs.dev.db`, so development can't
touch the real data; set `Database:Path` to override it for the standalone API.

## Rules

- **Language:** UI text in Spanish. Code, comments, commits, and docs in English.
- **Zero warnings:** `TreatWarningsAsErrors` is on. Fix warnings; don't suppress them.
- **Dates:** use `DateTime.Now` (local Costa Rica time), never `UtcNow`. The frontend sends dates as local
  `YYYY-MM-DD` strings, never `toISOString()`.
- **Money:** stored as `long` (whole colones). Never `decimal` in entities, because SQLite cannot aggregate decimal.
  `AppDbContext` throws if an entity has a `decimal` property.
- **Primary keys:** `Guid`, generated in code.
- **Entities:** every entity inherits `BaseEntity` (`CreatedAt`, `UpdatedAt`, `IsDeleted`). Deletes are soft deletes:
  `Remove` sets `IsDeleted`, and a global query filter hides the row. `ExecuteUpdate` and `ExecuteDelete` skip the
  timestamps and soft delete, so don't use them on entities without handling both.
- **Soft delete limits, to decide per entity when Customers and Sales arrive:** soft delete doesn't cascade to related
  rows that aren't loaded, and a unique index still counts soft-deleted rows, so it must either include `IsDeleted` or
  filter on it.
- **Backend:** Vertical Slice Architecture. Build order: Command → Validator → Handler → Entity → Endpoint → Migration.
- **Frontend:** build order: Screen → Service/Hook → State.
- **UI state:** anything that must survive a restart goes through the API to SQLite. Never use `localStorage`,
  `sessionStorage`, IndexedDB, or cookies: the origin changes on every launch, so they start empty each time.
- **User data on disk:** only under `%LocalAppData%\EggsApp` (see `AppDataPaths`), never next to the exe.
- **UX for an elderly user:** large targets, 18px+ text, at most 2–3 actions per screen, confirmation dialogs.
- **Data safety:** never commit `.db` files or backup JSON files.
- **Commits:** Conventional Commits with a footer `Refs: AB#<id>` (Azure Boards) when a ticket exists. No co-author or attribution trailers; commits are authored solely by the user.
- **Screenshots:** never capture the full screen; only capture the app's own windows.
