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
    Features/<Feature>/        Vertical slices (e.g. Features/Customers/: one file per action, plus CustomerEndpoints.cs)
    Features/Common/           Outcome (200/400/404/409 from a handler), Refusal, CalendarDays, Colones
    wwwroot/                   React build output (git-ignored)
  EggsApp.Desktop/             WPF shell (net10.0-windows); hosts the API in-process + WebView2
    App.xaml.cs                Startup order, shutdown, failure handling
    MainWindow.xaml.cs         WebView2 setup and navigation rules
    SingleInstance.cs          One running copy; a second launch focuses it
    UiText.cs                  Spanish text of the desktop shell
    Assets/app.ico             Application and window icon
  Frontend.targets             Builds the UI and adds it to the publish output of the API and Desktop
  web/                         React + Vite + TypeScript (pnpm)
    src/routes.tsx             All screens and their addresses
    src/theme/tokens.css       Design tokens: colors, spacing, radii, font sizes
    src/components/            Button, inputs, DayPicker, ConfirmDialog, useMessages (success and error messages)
    src/layout/                AppLayout (status footer), Screen (header with "‹ Volver"), useUnsavedChanges, useOneAtATime
    src/lib/                   Money and date helpers, selectOnFocus
    src/screens/               Screens; dev/ is a components page that exists only in pnpm dev
    src/services/              API calls; http.ts has the timeout and ApiError
    vite.config.ts             Dev proxy: /api → http://localhost:5080; Vitest settings
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
cd src/web && pnpm dev | pnpm build | pnpm lint | pnpm test   # pnpm build writes to src/EggsApp.Api/wwwroot
dotnet publish src/EggsApp.Desktop -p:PublishProfile=win-x64   # the shipped app: self-contained, includes the UI
```

`pnpm dev` also serves the base components at `/dev/componentes`. Publishing builds the UI; `-p:SkipFrontendBuild=true` publishes `wwwroot` as is. In Debug, the desktop app uses
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
- **Soft delete limits, to decide per entity:** soft delete doesn't cascade to related rows that aren't loaded, and a
  unique index still counts soft-deleted rows, so it must either include `IsDeleted` or filter on it.
- **Customers:** names aren't unique, so there's no unique index and a deleted customer's name can be reused; the UI
  asks before saving a similar name. A deleted customer is gone from lists, search and the similar-name check, and
  `GET`, `PUT` and `DELETE` answer 404. There's no undelete screen, but the row stays. Sales must keep showing a deleted
  customer's name, which takes `IgnoreQueryFilters` (`CustomerAccounts.FindRefsAsync`). Only a customer who owes nothing
  can be deleted (`DeleteCustomer.FindBlockerAsync`, 409); their sales and abonos stay and can't change after.
- **Comparing names:** use `CustomerNames`, in C#. SQLite's `LIKE` and `ORDER BY` get accents and Spanish order wrong.
- **Sales:** a `Sale` is one purchase, like an invoice, with `SaleItem` lines (carton type A = 15 eggs or B = 30, whole
  quantity, unit price). The server calculates `LineTotal` and `Total` and ignores any sent to it; there's no way to
  override a total. `SaleDate` is a `DateOnly`, so no clock or time zone can move a sale to another day. Editing keeps
  the sale's id and replaces all its lines; deleting soft-deletes the lines too, by loading them.
- **Income:** cash-basis. A cash sale counts on its sale date, and an abono on its payment date. A credit sale (fiado)
  is never income: it's owed. `cashTotal` skips credit sales; Ventas shows "Entró" as cash sales plus abonos.
- **Credit:** a credit sale has `IsCredit` and a `CustomerId`, and a cash sale has neither (a check constraint).
  Each customer has one running account: balance = their credit sales − their abonos (`Payment`), worked out on every
  read, never stored. An abono isn't tied to a sale. The balance never goes below 0: an abono can't be more than is
  owed, and editing, moving or deleting a credit sale is refused (409) if it would leave less than was already paid.
  A new sale must be told "Al contado" or "Fiado" each time; there's no default.
- **Expenses:** cash-basis, like income: an `Expense` counts on its `ExpenseDate`. Its category is a row of
  `ExpenseCategory`, not code: the migration seeds them with fixed ids, and a new or renamed one is a data change
  (there's no screen for it yet). A category is never removed, only retired (soft-deleted, with a Restrict FK):
  its old expenses keep showing its name (`ExpenseCategories.FindRefsAsync`) and can keep it when edited, but it's
  no longer offered. A category with `NeedsDescription` ("Otro") requires the note. A new expense starts with no
  category chosen.
- **Summaries:** `GetSummary` never adds anything up on its own: it calls `ListSales`, `ListPayments`,
  `ListExpenses` and `ListCustomers` and combines their results, so Resúmenes can't disagree with Ventas, Gastos or
  Clientes. Entró = cash sales + abonos; Gastado = expenses; Quedó = Entró − Gastado (it can be negative). Fiado is
  shown apart, and "Por cobrar en total" is today's, whatever the period. Weeks start on Monday, and the current week
  or month stops at today.
- **Last prices:** the form starts with the price of the latest active line per carton type, by sale date rather than
  entry date, so typing in an old sale doesn't replace the current price.
- **Backend:** Vertical Slice Architecture. Build order: Command → Validator → Handler → Entity → Endpoint → Migration.
- **Frontend:** build order: Screen → Service/Hook → State.
- **UI state:** anything that must survive a restart goes through the API to SQLite. Never use `localStorage`,
  `sessionStorage`, IndexedDB, or cookies: the origin changes on every launch, so they start empty each time.
- **User data on disk:** only under `%LocalAppData%\EggsApp` (see `AppDataPaths`), never next to the exe.
- **UX for an elderly user:** large targets, 18px+ text, at most 2–3 actions per screen, confirmation dialogs. Inicio
  is the one exception to the action limit: it has a button per module. Tokens keep text and buttons at 7:1 contrast.
  The browser's calendar popup is a known exception to the size rule: CSS can't reach it (about 13px text and 28px
  days at 125% scaling), so `DayPicker` offers Hoy and Ayer as large buttons, and a date can be typed.
- **Dates and money in the UI:** use `lib/dates.ts` and `lib/money.ts`. `new Date("YYYY-MM-DD")` means UTC and shows
  the day before in Costa Rica; `Intl` doesn't give `₡12.500` for `es-CR`.
- **Navigation:** "‹ Volver" goes to the parent screen, never browser history, so it still works after a reload.
- **Forms:** use `useUnsavedChanges` so leaving asks first. It also tells the window, which asks before closing. Don't
  disable the button being pressed while saving, because that loses keyboard focus: use `useOneAtATime`.
- **Sale, abono and expense form keyboard:** Enter moves on (type → quantity → price → "Al contado" until a payment is
  chosen → "Guardar venta"; amount → note → "Guardar abono"; category → amount → note → "Guardar gasto") and never
  saves from a field; only activating the button saves. So these forms have no `<form>` element, and a held-down Enter
  is ignored. All three must keep their save button in sight at 1093×560.
- **Data safety:** never commit `.db` files or backup JSON files.
- **Commits:** Conventional Commits with a footer `Refs: AB#<id>` (Azure Boards) when a ticket exists. No co-author or attribution trailers; commits are authored solely by the user.
- **Screenshots:** never capture the full screen; only capture the app's own windows.
