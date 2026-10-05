<?php

use App\Http\Controllers\Api\CrudController;
use App\Http\Controllers\Api\MaterialBatchController;
use App\Http\Controllers\Api\MovementController;
use App\Http\Controllers\Api\OutflowController;
use App\Http\Controllers\Api\ProductionController;
use App\Http\Controllers\Api\RecipeController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\TraceabilityController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Sveikatos patikra - frontendas tikrina ryšį su backend
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
        'database' => DB::connection()->getDatabaseName(),
    ]);
});

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

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
Route::get('material-batches/{id}', [MaterialBatchController::class, 'show']);

Route::get('productions', [ProductionController::class, 'index']);
Route::post('productions', [ProductionController::class, 'store']);   // automatinis FIFO sunaudojimas
Route::get('productions/{id}', [ProductionController::class, 'show']);
Route::delete('productions/{id}', [ProductionController::class, 'destroy']);

Route::get('material-outflows', [OutflowController::class, 'index']);
Route::post('material-outflows', [OutflowController::class, 'store']);

// ---- Produkto judėjimai ----
Route::get('product-movements', [MovementController::class, 'index']);
Route::post('product-movements', [MovementController::class, 'store']);

// ---- Atsekamumas ----
Route::get('traceability/batch/{id}', [TraceabilityController::class, 'batch']);
Route::get('traceability/l-week/{code}', [TraceabilityController::class, 'lWeek']);

// ---- Ataskaitos (Excel suvestinės) ----
Route::get('reports/dashboard', [ReportController::class, 'dashboard']);
Route::get('reports/batch-balances', [ReportController::class, 'batchBalances']);
Route::get('reports/warehouse-stock', [ReportController::class, 'warehouseStock']);
Route::get('reports/shipments', [ReportController::class, 'shipments']);

// ---- Automatinis fasavimo rūšies parinkimas pagal svorį (Priedas A) ----
Route::get('suggest-pack', [RecipeController::class, 'suggestPack']);
