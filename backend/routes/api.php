<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CrudController;
use App\Http\Controllers\Api\HistoryController;
use App\Http\Controllers\Api\MaterialBatchController;
use App\Http\Controllers\Api\MovementController;
use App\Http\Controllers\Api\OutflowController;
use App\Http\Controllers\Api\ProductionController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\TraceabilityController;
use App\Http\Controllers\Api\WriteoffActController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Sveikatos patikra - frontendas tikrina ryšį su backend
Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
    } catch (\Throwable $e) {
        return response()->json([
            'status' => 'db_error',
            'app' => config('app.name'),
            'database' => DB::connection()->getDatabaseName(),
        ], 503);
    }

    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
        'database' => DB::connection()->getDatabaseName(),
    ]);
});

// ---- Prisijungimas ----
Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// Visa kita - tik prisijungusiems
Route::middleware(['auth:sanctum', 'password.changed'])->group(function () {

Route::get('user', [AuthController::class, 'me']);
Route::post('logout', [AuthController::class, 'logout']);
Route::post('change-password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');

// ---- Klasifikatoriai (paprasčiausi CRUD) ----
Route::apiResource('raw-materials', CrudController::class)->parameters(['raw-materials' => 'id']);
Route::apiResource('production-products', CrudController::class)->parameters(['production-products' => 'id']);
Route::apiResource('packed-products', CrudController::class)->parameters(['packed-products' => 'id']);
Route::apiResource('warehouses', CrudController::class)->parameters(['warehouses' => 'id']);
Route::apiResource('shops', CrudController::class)->parameters(['shops' => 'id']);
Route::apiResource('l-weeks', CrudController::class)->parameters(['l-weeks' => 'id']);
Route::apiResource('recipe-items', CrudController::class)->parameters(['recipe-items' => 'id']);

// ---- Receptūros (su eilutėmis) ----
Route::get('recipes', [RecipeController::class, 'index']);
Route::get('recipes/{id}', [RecipeController::class, 'show']);
Route::post('recipes', [RecipeController::class, 'store']);

// ---- Žaliavų apskaita ----
Route::get('material-batches', [MaterialBatchController::class, 'index']);
Route::post('material-batches', [MaterialBatchController::class, 'store']);
Route::put('material-batches/{id}', [MaterialBatchController::class, 'update']);    // taisymas (pvz. vėliau įvesta savikaina)
Route::get('material-batches/{id}', [MaterialBatchController::class, 'show']);
Route::post('material-batches/{id}/lock', [MaterialBatchController::class, 'lock']);      // įspajamojimas
Route::delete('material-batches/{id}', [MaterialBatchController::class, 'destroy']);

Route::get('productions', [ProductionController::class, 'index']);
Route::post('productions', [ProductionController::class, 'store']);   // automatinis FIFO sunaudojimas
Route::post('productions/preview', [ProductionController::class, 'preview']); // FIFO planas nerašant
Route::get('productions/product-info/{id}', [ProductionController::class, 'productInfo']); // pasirinktos rūšies informacija
Route::post('productions/{id}/lock', [ProductionController::class, 'lock']);
Route::get('productions/{id}', [ProductionController::class, 'show']);
Route::delete('productions/{id}', [ProductionController::class, 'destroy']);

Route::get('material-outflows', [OutflowController::class, 'index']);
Route::post('material-outflows', [OutflowController::class, 'store']);
Route::post('material-outflows/{id}/lock', [OutflowController::class, 'lock']);
Route::delete('material-outflows/{id}', [OutflowController::class, 'destroy']);

// ---- Žaliavų nurašymo aktai ----
Route::get('writeoff-acts', [WriteoffActController::class, 'index']);
Route::post('writeoff-acts', [WriteoffActController::class, 'store']);
Route::get('writeoff-acts/{id}', [WriteoffActController::class, 'show']);
Route::post('writeoff-acts/{id}/lock', [WriteoffActController::class, 'lock']);
Route::delete('writeoff-acts/{id}', [WriteoffActController::class, 'destroy']);

// ---- Produkto judėjimai ----
Route::get('product-movements', [MovementController::class, 'index']);
Route::post('product-movements', [MovementController::class, 'store']);
Route::post('product-movements/{id}/lock', [MovementController::class, 'lock']);
Route::delete('product-movements/{id}', [MovementController::class, 'destroy']);

// ---- Istorija (visos registracijos/keitimai/uzraktai) ----
Route::get('history', [HistoryController::class, 'index']);

// ---- Atsekamumas ----
Route::get('traceability/batch/{id}', [TraceabilityController::class, 'batch']);
Route::get('traceability/l-week/{code}', [TraceabilityController::class, 'lWeek']);

// ---- Ataskaitos (Excel suvestinės) ----
Route::get('reports/dashboard', [ReportController::class, 'dashboard']);
Route::get('reports/batch-balances', [ReportController::class, 'batchBalances']);
Route::get('reports/batches', [ReportController::class, 'batches']);   // partijų / likučių ataskaita
Route::get('reports/usage', [ReportController::class, 'usage']);       // sunaudojimo ataskaita
Route::get('reports/cost', [ReportController::class, 'cost']);         // gaminių žaliavų savikaina
Route::get('reports/warehouse-stock', [ReportController::class, 'warehouseStock']);
Route::get('reports/shipments', [ReportController::class, 'shipments']);

// ---- Automatinis fasavimo rūšies parinkimas pagal svorį (Priedas A) ----
Route::get('suggest-pack', [RecipeController::class, 'suggestPack']);

});
