<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CrudController;
use App\Http\Controllers\Api\HistoryController;
use App\Http\Controllers\Api\MaterialBatchController;
use App\Http\Controllers\Api\MovementController;
use App\Http\Controllers\Api\OutflowController;
use App\Http\Controllers\Api\PackagingController;
use App\Http\Controllers\Api\ProductionController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\RecipeAdjustmentController;
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
        ], 503);
    }

    return response()->json([
        'status' => 'ok',
        'app' => config('app.name'),
    ]);
});

// ---- Prisijungimas ----
Route::post('login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// Visa kita - tik prisijungusiems
Route::middleware(['auth:sanctum', 'password.changed', 'throttle:300,1'])->group(function () {

Route::get('user', [AuthController::class, 'me']);
Route::post('logout', [AuthController::class, 'logout']);
Route::post('change-password', [AuthController::class, 'changePassword'])->middleware('throttle:10,1');

// ---- Klasifikatoriai (paprasčiausi CRUD) ----
// tvarka (tempimas pele) - prieš apiResource, kad nesusikirstų su {id}
foreach (['raw-materials', 'production-products', 'packed-products', 'warehouses', 'shops', 'packaging-materials'] as $res) {
    Route::post($res . '/reorder', [CrudController::class, 'reorder']);
}
Route::apiResource('packaging-materials', CrudController::class)->parameters(['packaging-materials' => 'id']);
Route::apiResource('raw-materials', CrudController::class)->parameters(['raw-materials' => 'id']);
Route::apiResource('production-products', CrudController::class)->parameters(['production-products' => 'id']);
Route::apiResource('packed-products', CrudController::class)->parameters(['packed-products' => 'id']);
Route::apiResource('warehouses', CrudController::class)->parameters(['warehouses' => 'id']);
Route::apiResource('shops', CrudController::class)->parameters(['shops' => 'id']);
Route::apiResource('l-weeks', CrudController::class)->parameters(['l-weeks' => 'id']);

// ---- Receptūros (su eilutėmis) ----
Route::get('recipes', [RecipeController::class, 'index']);
Route::get('recipes/{id}', [RecipeController::class, 'show']);
Route::post('recipes', [RecipeController::class, 'store']);
Route::put('recipes/{id}', [RecipeController::class, 'update']);
Route::delete('recipes/{id}', [RecipeController::class, 'destroy']);

// ---- Pakavimas ----
Route::get('packaging-batches', [PackagingController::class, 'batches']);
Route::post('packaging-batches', [PackagingController::class, 'storeBatch']);
Route::put('packaging-batches/{id}', [PackagingController::class, 'updateBatch']);
Route::post('packaging-batches/{id}/lock', [PackagingController::class, 'lockBatch']);
Route::delete('packaging-batches/{id}', [PackagingController::class, 'destroyBatch']);
Route::get('packaging-stock', [PackagingController::class, 'stock']);
Route::get('transport-norms', [PackagingController::class, 'norms']);
Route::post('transport-norms/reorder', [PackagingController::class, 'reorderNorms']);
Route::post('transport-norms', [PackagingController::class, 'storeNorm']);
Route::put('transport-norms/{id}', [PackagingController::class, 'updateNorm']);
Route::delete('transport-norms/{id}', [PackagingController::class, 'destroyNorm']);
Route::get('packing-specs', [PackagingController::class, 'specs']);
Route::put('packing-specs/{packedProductId}', [PackagingController::class, 'saveSpecs']);
Route::get('packings', [PackagingController::class, 'index']);
Route::post('packings', [PackagingController::class, 'store']);
Route::post('packings/{id}/lock', [PackagingController::class, 'lock']);
Route::delete('packings/{id}', [PackagingController::class, 'destroy']);

// ---- Žaliavų apskaita ----
Route::get('material-batches', [MaterialBatchController::class, 'index']);
Route::post('material-batches', [MaterialBatchController::class, 'store']);
Route::put('material-batches/{id}', [MaterialBatchController::class, 'update']);    // taisymas (pvz. vėliau įvesta savikaina)
Route::get('material-batches/{id}', [MaterialBatchController::class, 'show']);
Route::post('material-batches/{id}/lock', [MaterialBatchController::class, 'lock']);      // įspajamojimas
Route::delete('material-batches/{id}', [MaterialBatchController::class, 'destroy']);

Route::get('productions', [ProductionController::class, 'index']);
Route::post('productions', [ProductionController::class, 'store']);   // automatinis FIFO sunaudojimas
Route::post('productions/recalculate', [ProductionController::class, 'recalculate'])->middleware('throttle:10,1'); // TRŪKSTA / perskaičiavimas
Route::post('productions/preview', [ProductionController::class, 'preview']); // FIFO planas nerašant
Route::get('productions/product-info/{id}', [ProductionController::class, 'productInfo']); // pasirinktos rūšies informacija
Route::post('productions/{id}/lock', [ProductionController::class, 'lock']);
Route::get('productions/{id}', [ProductionController::class, 'show']);
Route::delete('productions/{id}', [ProductionController::class, 'destroy']);

// ---- Mėnesio sunaudojimo korekcijos (pagrindinė receptūra nekeičiama) ----
Route::get('recipe-adjustments', [RecipeAdjustmentController::class, 'index']);
Route::get('recipe-adjustments/context', [RecipeAdjustmentController::class, 'context']);
Route::post('recipe-adjustments', [RecipeAdjustmentController::class, 'store']);
Route::put('recipe-adjustments/{id}', [RecipeAdjustmentController::class, 'update']);
Route::post('recipe-adjustments/{id}/lock', [RecipeAdjustmentController::class, 'lock']);
Route::delete('recipe-adjustments/{id}', [RecipeAdjustmentController::class, 'destroy']);

// ---- Darbo užmokestis (DU) ----
Route::get('workers', [PayrollController::class, 'workers']);
Route::post('workers', [PayrollController::class, 'storeWorker']);
Route::put('workers/{id}', [PayrollController::class, 'updateWorker']);
Route::delete('workers/{id}', [PayrollController::class, 'destroyWorker']);
Route::get('work-operations', [PayrollController::class, 'operations']);
Route::post('work-operations', [PayrollController::class, 'storeOperation']);
Route::put('work-operations/{id}', [PayrollController::class, 'updateOperation']);
Route::delete('work-operations/{id}', [PayrollController::class, 'destroyOperation']);
Route::get('work-rates', [PayrollController::class, 'rates']);
Route::post('work-rates', [PayrollController::class, 'storeRate']);
Route::put('work-rates/{id}', [PayrollController::class, 'updateRate']);
Route::delete('work-rates/{id}', [PayrollController::class, 'destroyRate']);
Route::get('work-entries', [PayrollController::class, 'entries']);
Route::post('work-entries', [PayrollController::class, 'storeEntry']);
Route::post('work-entries/approve-period', [PayrollController::class, 'approvePeriod']);
Route::put('work-entries/{id}', [PayrollController::class, 'updateEntry']);
Route::post('work-entries/{id}/lock', [PayrollController::class, 'lockEntry']);
Route::delete('work-entries/{id}', [PayrollController::class, 'destroyEntry']);
Route::get('work-summary', [PayrollController::class, 'summary']);

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
