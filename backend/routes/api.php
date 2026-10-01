<?php

use App\Http\Controllers\Api\CrudController;
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

// REST CRUD visoms lentelėms (modelis parenkamas pagal URL segmentą)
Route::apiResource('raw-materials', CrudController::class)->parameters(['raw-materials' => 'id']);
Route::apiResource('production-products', CrudController::class)->parameters(['production-products' => 'id']);
Route::apiResource('packed-products', CrudController::class)->parameters(['packed-products' => 'id']);
Route::apiResource('warehouses', CrudController::class)->parameters(['warehouses' => 'id']);
Route::apiResource('shops', CrudController::class)->parameters(['shops' => 'id']);
Route::apiResource('l-weeks', CrudController::class)->parameters(['l-weeks' => 'id']);
Route::apiResource('recipes', CrudController::class)->parameters(['recipes' => 'id']);
Route::apiResource('recipe-items', CrudController::class)->parameters(['recipe-items' => 'id']);
Route::apiResource('material-batches', CrudController::class)->parameters(['material-batches' => 'id']);
Route::apiResource('productions', CrudController::class)->parameters(['productions' => 'id']);
Route::apiResource('material-usages', CrudController::class)->parameters(['material-usages' => 'id']);
Route::apiResource('material-outflows', CrudController::class)->parameters(['material-outflows' => 'id']);
Route::apiResource('product-movements', CrudController::class)->parameters(['product-movements' => 'id']);
