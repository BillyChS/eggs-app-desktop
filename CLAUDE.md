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
    Hosting/                   EmbeddedApiHost (in-process host), FailureLog, AppDataPaths, AppVersion
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
    src/components/            Button, inputs, Dropdown, DayPicker, ConfirmDialog, useMessages (success and error messages)
    src/layout/                AppLayout + Sidebar (pages, connection, backup, version), Screen (header, "‹ Volver" on inner
                               screens), useUnsavedChanges, useOneAtATime
    src/lib/                   Money and date helpers, selectOnFocus
    src/screens/               Screens; dev/ is a components page that exists only in pnpm dev
    src/screens/sales/         Ventas (salesView: day or month and tab, in the address) and the sale form
    src/services/              API calls; http.ts has the timeout and ApiError
    src/test/                  Test setup, and a fake API (api.tsx) for screen tests
    vite.config.ts             Dev proxy: /api → http://localhost:5080; Vitest settings
docs/design/                   The design prototypes (Main = Ventas, NuevaVenta = sale form), kept as they came
tests/
  EggsApp.Tests/               xUnit; integration tests via WebApplicationFactory<Program>
installer/                     EggsApp.iss (Inno Setup, per-user) and build.ps1, which publishes and builds it
.github/workflows/installer.yml  Builds the installer on v* tags into a GitHub Release; not part of PR CI
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
powershell -ExecutionPolicy Bypass -File installer\build.ps1   # the installer, in artifacts\installer (needs Inno Setup 6)
```

`pnpm dev` also serves the base components at `/dev/componentes`. Publishing builds the UI; `-p:SkipFrontendBuild=true` publishes `wwwroot` as is. In Debug, the desktop app uses
`src/EggsApp.Api/wwwroot`, so run `pnpm build` first.

### Migrations

```sh
dotnet tool restore                        # once per clone; installs the pinned dotnet-ef
dotnet ef migrations add <Name> --project src/EggsApp.Api --output-dir Data/Migrations
```

Migrations apply automatically at startup, before the host listens, so there's no `database update` step. If the
database has data and migrations are pending, it's first copied to `backups\` (the 5 newest are kept). A failure
stops the app.

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
  can be deleted (`DeleteCustomer.FindBlockerAsync`, 409); their fiados and abonos stay and can't change after. A cash
  sale naming them stays editable (it moves no balance) and keeps the name, but nothing new can go to them.
- **Comparing names:** use `CustomerNames`, in C#. SQLite's `LIKE` and `ORDER BY` get accents and Spanish order wrong.
- **Sales:** a `Sale` is one purchase, like an invoice, with `SaleItem` lines (carton type A = 15 eggs or B = 30, whole
  quantity, unit price). The server calculates `LineTotal` and `Total` and ignores any sent to it; there's no way to
  override a total. `SaleDate` is a `DateOnly`, so no clock or time zone can move a sale to another day. Editing keeps
  the sale's id and replaces all its lines; deleting soft-deletes the lines too, by loading them.
- **Income:** cash-basis. A cash sale counts on its sale date, and an abono on its payment date. A credit sale (fiado)
  is never income: it's owed. `cashTotal` skips credit sales; Ventas shows "Entró" as cash sales plus abonos.
- **Who a sale is for:** the form always has someone chosen once the payment is. "Cliente sin nombre" is a sale with no
  `CustomerId` (Resúmenes counts these as "Ventas sin cliente"); it's what a cash sale starts with, and a fiado can't be
  it ("Para fiar hay que elegir un cliente con nombre"). Someone new is added from the form with `newCustomer` in place
  of `customerId`, checked by `CustomerValidator` and saved in the sale's `SaveChanges` (`SaleCredit.ResolveCustomer`);
  the form asks about similar names first, as Clientes does.
- **Credit:** a credit sale has `IsCredit` and always a `CustomerId` (check constraint `IsCredit = 0 OR CustomerId IS
  NOT NULL`). A cash sale's customer is only who bought it: that never touches a balance, so every
  balance and credit rule filters on `IsCredit`, never on `CustomerId` alone. Each customer has one running account:
  balance = their credit sales − their abonos (`Payment`), worked out on every read, never stored. The balance never
  goes below 0: an abono can't be more than is owed, and editing, moving or deleting a credit sale is refused (409) if
  it would leave less than was already paid. A new sale must be told "Al contado" or "Fiado" each time; there's no
  default. The customer statement is fiados and abonos only; cash purchases are listed apart (`CashPurchases`).
- **Paid with a fiado:** "¿Pagó algo ahora?" saves the credit sale and an abono with `Payment.SaleId` in one
  `SaveChanges`. It must be less than the total (all of it is "Al contado", which the form offers to switch to). That
  abono follows its sale (`SaleCredit.ApplyPaidNow`): editing the sale changes it, moving the sale to another customer
  replaces it, switching to cash or deleting the sale deletes it, and its own `PUT`/`DELETE` answer 409. Every other
  abono isn't tied to any sale.
- **Sale status:** what each fiado still owes ("Debe ₡X" or "Pagado con abonos"; a cash sale is "Pagado") is
  `SaleDetail.Owed`, from `SaleStatuses`: per customer, a linked abono pays its own sale first, then all their other
  abonos pay their oldest fiados first (sale date, then `CreatedAt`, then `Id`), from all their history, whatever the
  period shown. Worked out on every read, never stored, so the sales' `Owed` always add up to the balance; editing or
  deleting an old fiado or an abono can change the status of newer ones.
- **Ventas:** one day (Hoy, Ayer, Otro día) or one month (‹ ›, never past the current one, which stops at today), and a
  tab: Fiado, Contado or Abonos. The view lives in the address (`?fecha=` or `?mes=`, `&pestana=`, see `salesView.ts`)
  and screens opened from it carry it, to come back to it. The cards are `GetSummary`'s numbers for the same range, so
  they match Resúmenes; the table and its search are the period's `ListSales` and `ListPayments`.
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
  or month stops at today. "Mejores clientes" ranks only sales with a customer (cash with a buyer and fiado) and always
  shows "Ventas sin cliente" next to it: ranked + others + without customer = cash + fiado of the period.
- **Last prices:** the form starts with the price of the latest active line per carton type, by sale date rather than
  entry date, so typing in an old sale doesn't replace the current price.
- **Backend:** Vertical Slice Architecture. Build order: Command → Validator → Handler → Entity → Endpoint → Migration.
- **Frontend:** build order: Screen → Service/Hook → State.
- **UI state:** anything that must survive a restart goes through the API to SQLite. Never use `localStorage`,
  `sessionStorage`, IndexedDB, or cookies: the origin changes on every launch, so they start empty each time.
- **User data on disk:** only under `%LocalAppData%\EggsApp` (see `AppDataPaths`), never next to the exe. The one
  exception is the backups' second location (`%OneDrive%\Respaldos Eggs App` by default).
- **Backups:** `Features/Backups/` (desktop only: `Backup:Enabled` is set by `EmbeddedApiHost`, so the standalone API
  and tests never make any). Copies of the live database use `SqliteBackup.CopyDatabase` (backup API, integrity check,
  then rename), never `File.Copy`. A backup must never throw into the host or stop the app: log it and let the status
  warn. Pruning only deletes names matching `BackupFiles` patterns. Warnings count days the app was used, never
  calendar days. Tests that start `EmbeddedApiHost` must turn the second location off or point it at a temp folder,
  or they write into the real OneDrive. Restore steps are in README.md.
- **UX for an elderly user:** large targets (56px controls), 18px+ text, at most 2–3 main actions per screen besides
  the sidebar and a table's row buttons, confirmation dialogs. Tokens keep text and buttons at 7:1 contrast, and input
  edges at 3:1 or more. The look follows `docs/design/`. Optional fields look optional: "(opcional)" in the label,
  never blocking a save; required ones have no mark.
- **Choices:** a choice with a few options and no room for a row of buttons is a `Dropdown` (¿Cómo pagó?, Tipo de
  cartón): never a `<select>`, whose list the browser draws small. Where there's room, large buttons that show every
  option at once (expense categories, periods) stay.
- **Screen sizes:** the target is a 21" or larger monitor at 1920×1080, 100% scaling. Layouts are checked at
  1920×1080 and 1366×768 (both at 100%), the app maximized.
  The browser's calendar popup is a known exception to the size rule: CSS can't reach it (about 13px text and 28px
  days at 125% scaling), so a date can always be typed, and Ventas, abonos and expenses offer Hoy and Ayer as large
  buttons. A new sale starts on the day Ventas was showing.
- **Dates and money in the UI:** use `lib/dates.ts` and `lib/money.ts`. `new Date("YYYY-MM-DD")` means UTC and shows
  the day before in Costa Rica; `Intl` doesn't give `₡12.500` for `es-CR`.
- **Navigation:** the sidebar is always there with the four pages by name (no submenus), and marks the page a screen
  is under. The app opens on Ventas. Screens under a page have "‹ Volver" to it (the sale form has Cancelar and ✕),
  never browser history, so it still works after a reload.
- **Forms:** use `useUnsavedChanges` so leaving asks first. It also tells the window, which asks before closing. Don't
  disable the button being pressed while saving, because that loses keyboard focus: use `useOneAtATime`.
- **Sale, abono and expense form keyboard:** Enter moves on and never saves from a field; only activating the button
  saves. The sale form opens on ¿Cómo pagó? and asks in this order: Fecha → ¿Cómo pagó? → each line's type → quantity
  → price → "¿Pagó algo ahora?" (fiado only) → Cliente (skipped once someone is chosen, as "Cliente sin nombre" is for
  a cash sale; Enter in the search goes to the first name, it doesn't pick it) → "Guardar venta". Abono: amount → note
  → "Guardar abono". Expense: category → amount → note → "Guardar gasto". So these forms have no `<form>` element, and
  a held-down Enter is ignored. All three must keep their save button in sight at both screen sizes above: the sale
  form's header and buttons stay put while its middle scrolls.
- **Data safety:** never commit `.db` files or backup JSON files.
- **Version:** `<Version>` in `Directory.Build.props` is the only place it's set; read it through `AppVersion`. A `v*`
  tag must match it.
- **Installer:** it installs to `%LocalAppData%\Programs\Eggs App` and must never touch `%LocalAppData%\EggsApp`: no
  `[InstallDelete]` or `[UninstallDelete]` outside `{app}`. Keep the `AppId` GUID and the `AppMutex` name in step
  with `SingleInstance`. An installer older than the installed version is refused. Installer text is Spanish.
- **Commits:** Conventional Commits with a footer `Refs: AB#<id>` (Azure Boards) when a ticket exists. No co-author or attribution trailers; commits are authored solely by the user.
- **Screenshots:** never capture the full screen; only capture the app's own windows.
