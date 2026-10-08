# Romnesa — Full Project Handover

Complete context for continuing development. Written 2026-10-08.

## 1. What this project is

**Romnesa** is a food-production tracking system (Lithuanian UI) for a company making marinated/sauced meat products. It tracks:

- Raw material batches (receipts, expiry dates, suppliers)
- Productions (batches of product made, consuming raw materials via FIFO)
- Material outflows (transfers/write-offs)
- Product movements (pack-in → warehouse → shop shipping)
- L-weeks (production week codes for traceability)
- Recipes (production product → required raw materials)
- Full traceability (batch → which productions/movements; L-week → everything)

## 2. Tech stack & layout

```
backend/   Laravel 12, PHP 8.x, Sanctum (installed but auth NOT enforced — API is open)
frontend/  React 18 + TypeScript + Vite + Tailwind CSS
```

Dev servers (Windows, run in two terminals):

```powershell
# backend (from backend/)
php artisan serve --port=8080

# frontend (from frontend/)
npm run dev          # serves on :5173
```

Frontend build (`npm run build`) outputs into `backend/public/app` — Laravel serves the built SPA from there in production-style deployment.

For LAN access from another PC: run `php artisan serve --host=0.0.0.0 --port=8080` and `npm run dev -- --host`, then the other PC hits `http://<host-ip>:5173` — frontend calls `http://<host-ip>:8080/api` (API base URL is in `frontend/src/api.ts`).

## 3. Database — NOW MariaDB (was SQLite)

**Current state: MariaDB 13.0.2** (MySQL-compatible drop-in, Laravel `mysql` driver — same SQL, InnoDB, `mysqldump`, `mysql` client all work identically).

- Installed via `winget install MariaDB.Server` — binaries at `C:\Program Files\MariaDB 13.0\bin\`
- Runs as a **permanent Windows service named `MariaDB`** (auto-starts). Check: `Get-Service MariaDB`
- Database `romnesa`, user `romnesa`/`romnesa`, host `127.0.0.1:3306`, utf8mb4
- `backend/.env` is **gitignored** — can't read/edit via file tools; use shell (`Get-Content .env` / `Set-Content`). Current DB lines:

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=romnesa
DB_USERNAME=romnesa
DB_PASSWORD=romnesa
```

**IMPORTANT for the next agent:** if the API throws connection errors, first check `Get-Service MariaDB` is `Running`. Starting/stopping the service requires an **elevated** PowerShell.

**All SQLite data was migrated** via a custom Artisan command `php artisan db:copy-sqlite` (`app/Console/Commands/CopySqliteToDefault.php`) — copies all 16 tables preserving IDs. The old `database/database.sqlite` file still exists as a backup — untouched, can be deleted or used to revert (switch `DB_CONNECTION=sqlite` back in .env).

Data volume: 10 raw materials, 3 production products, 8 packed products, 3 warehouses, 10 shops, 26 L-weeks, 3 recipes (18 items), 13 material batches, 1 production (6 usages), 3 product movements, audit logs.

## 4. Features implemented (previous session, all verified working)

### A. FIFO consumption preview — "iš kokios partijos nurašoma"

- `MaterialStockService::plan(int $rawMaterialId, float $qtyKg, ?string $notExpiredAfter)` — returns detailed per-batch allocation plan (batch number, expiry, balance, qty to take, shortage flag) WITHOUT writing. `allocateFifo()` now delegates to `plan()` and writes `material_usages` rows.
- `POST /api/productions/preview` (`ProductionController::preview`) — resolves the active recipe for a production product, returns `{recipe_version, plan[], shortage}` where `plan[]` = per raw-material → per batch allocations.
- Frontend `ProductionsPage`: picking product + kg + L-week live-shows the "nurašymo planas" panel — recipe version, each material, each source batch with balance, TRŪKSTA (shortage) warnings.

### B. Record locking ("įspajamojimas")

- `is_locked` boolean (indexed, default false) on `material_batches`, `productions`, `material_outflows`, `product_movements` — migration `2026_10_06_090000_add_locking_and_audit.php`
- Toggle: `POST /api/{material-batches|productions|material-outflows|product-movements}/{id}/lock`
- **Guards**: deleting a locked record → HTTP **423**; outflow from a locked batch → 423; locked production can't be deleted (deleting releases its batches, so it must be unlocked first). Batch deletion also blocked if it has usages or outflows.
- UI: every journal row (batches, productions, outflows, movements) has `įspajamoti / atrakinti` + `trinti` buttons and a lock badge. Locked badge text: "Užrakinta"/"Įspajamota" (intentionally "ispajamotas" Lithuanian style).

### C. Full audit history

- `audit_logs` table: `entity_type` (FQCN, e.g. `App\Models\Production`), `entity_id`, `action` (`created|updated|deleted|locked|unlocked`), `label` (human-readable), `payload` (JSON — on update: changed attrs), `user_id` (nullable, currently always null — no auth), `timestamps`
- **Global wildcard listeners** in `AppServiceProvider::boot` log created/updated/deleted for ALL `App\Models\*` except `AuditLog`. ⚠️ Known pitfall (fixed, but remember): Laravel wildcard event listeners get `(string $event, array $payload)` — the model is `$payload[0]`, NOT the first arg. Writing `(Model $m)` signature → 500 error.
- `AuditLog` model, `App\Support\Audit` helper, `App\Models\Concerns\Auditable` trait (provides `auditLabel()` and `logAudit()` — models using it: Production, MaterialBatch, MaterialOutflow, ProductMovement; lock/unlock entries are logged manually via `logAudit`, rest via listeners).
- `GET /api/history?entity=MaterialBatch&action=locked&entity_id=5&page=2` (`HistoryController`) — paginated, `entity` filter matches the **class basename**.
- Frontend: new **Istorija** tab (`HistoryPage.tsx`, wired in `App.tsx`) with entity filter + paging.

## 5. API surface (backend/routes/api.php — verified)

- `GET /api/health` → `{status, app, database}` (frontend uses this for the connection banner)
- CRUD classifiers: `apiResource` for raw-materials, production-products, packed-products, warehouses, shops, l-weeks, recipe-items (all via generic `CrudController`, `id` param binding)
- Recipes: index/show/store only (`RecipeController`), `GET /api/suggest-pack` (auto pack-type suggestion by weight)
- Domain tables + lock/destroy guards as listed in §4
- `GET /api/traceability/batch/{id}`, `GET /api/traceability/l-week/{code}`
- `GET /api/reports/{dashboard,batch-balances,warehouse-stock,shipments}` — live-computed from data (no denormalized stock — balances = received − used − outflowed, always real-time)

## 6. Frontend pages (frontend/src/pages/)

Dashboard, BatchesPage, ProductionsPage (preview panel + lock + detail expand fetching full `GET /api/productions/{id}` incl. usages — the index endpoint does NOT include usages), MovementsPage, OutflowsPage, TraceabilityPage, StockPage (warehouse stock card), HistoryPage, ClassifiersPage. Shared UI bits in `frontend/src/ui.tsx`; all API calls + TS types (`is_locked` included) in `frontend/src/api.ts`.

## 7. Things to know / gotchas

- **No auth**: Sanctum installed, `/api/user` exists, but everything else is open — `user_id` in audit_logs stays null. If user management gets added, wire auth into `Audit::write`.
- **Backend must be restarted** (`php artisan serve`) after `.env` changes — config is loaded in memory.
- Frontend `npm run build` = `tsc -b && vite build`; strict TS — keep types clean.
- Keep change confirmation dialogs (`window.confirm`) pattern on delete buttons.
- Batch balances are computed server-side (`MaterialStockService::batchBalance()`, set as `balance_kg` in controllers), never stored. Days to expiry: `MaterialBatch::daysToExpiry()`.
- There is a `TESTAUDIT` test batch in the DB (id 13) from audit verification — harmless, can delete.
- Production #1 is currently `is_locked=true` (left locked as a demo state).
- Comments/UI strings are Lithuanian — keep the existing vocabulary (partija=batch, žaliava=raw material, gamyba=production, perdavimas=transfer, įspajamoti=lock, trinti=delete).
- Laravel Eloquent wildcard listeners: signature `(string $event, array $payload)`, model = `$payload[0]` — see §4C pitfall.
- `.env` and other gitignored files can't be accessed by the IDE file tools — use shell commands.

## 8. Pending / known limitations (nothing blocking)

- Recipes can't be edited/deleted via API (index/show/store only).
- `AuditLog.user_id` unpopulated (no auth).
- Locked records: delete is guarded (423); controllers don't expose update for these resources so no other guards needed, but if update endpoints get added, guard them too.
- Frontend pagination: journals show first page only (API is paginated); HistoryPage has pager controls as the model.

## 9. Key files

Backend:
- `app/Services/MaterialStockService.php` — balances + `plan()`/`allocateFifo()`
- `app/Http/Controllers/Api/{ProductionController,MaterialBatchController,OutflowController,MovementController,HistoryController,CrudController,RecipeController,ReportController,TraceabilityController}.php`
- `app/Models/` — `AuditLog`, `Concerns/Auditable`, plus models with `Auditable` trait + `is_locked` cast
- `app/Support/Audit.php` — audit writer
- `app/Providers/AppServiceProvider.php` — global audit listeners
- `app/Console/Commands/CopySqliteToDefault.php` — `db:copy-sqlite`
- `bootstrap/app.php` — `withCommands(__DIR__.'/../app/Console/Commands')` for command discovery
- `database/migrations/2026_10_06_090000_add_locking_and_audit.php`
- `routes/api.php`

Frontend:
- `src/api.ts` — all endpoints + types
- `src/App.tsx` — tab routing
- `src/pages/HistoryPage.tsx` — audit log viewer
- `src/pages/ProductionsPage.tsx` — FIFO preview + lock/delete/detail
- `src/pages/{BatchesPage,MovementsPage,OutflowsPage}.tsx` — lock/delete rows

## 10. Cleanup pass (2026-10-08, later session)

- Lock toggles go through `Auditable::toggleLock()` (saveQuietly → one `locked`/`unlocked` audit row, no duplicate `updated`).
- `days_to_expiry` counted from `today()` (was `now()`, truncated → off by one).
- Movements: backend nulls fields irrelevant to the type (pack_in: no from/shop; move: no shop; ship_out: no to). Deleting a movement that would make warehouse stock negative → 422.
- `CrudController` only maps routed classifiers; unique/FK violations → 422 instead of 500.
- Traceability batch view now loads `warehouseFrom`; SPA fallback no longer 500s when frontend isn't built.
- Frontend: form dates default to local date (`todayIso()` in ui.tsx), not UTC.
- Removed: Laravel welcome view, Vite template assets, empty `_*.ps1` scripts, unused `getBatchBalances` export.

## 11. Client notes implemented (2026-10-08)

- FIFO per spec docx: batch must be received on/before production date and not expired; order = oldest `received_date` first (was expiry first).
- Exceptions (`raw_materials.requires_batch=false`, e.g. Vanduo): quantity recorded as usage with `material_batch_id=NULL`, NOT a shortage (dashboard, preview, UI use `isShortage()` in api.ts).
- `GET /api/productions/product-info/{id}?production_date&l_week_id` — recipe, packed products, recent productions; shown in ProductionsPage as soon as a type is picked.
- Batches: `used_kg`/`outflow_kg` (`MaterialStockService::withTotals`), per-batch "istorija" panel with running balance.
- Dashboard auto-refreshes every 30 s; per-material received/used/transferred/balance/expired table.
- History: `updated` payload has `_old` (old values) → shown as old → new; production delete removes usages via Eloquent so each is logged.
