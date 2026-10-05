<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialUsage;
use App\Models\Production;
use App\Models\Recipe;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Gamyba (Excel "2 Gamyba"). Sukūrus gamybą automatiškai
 * generuojamas sunaudojimas pagal galiojančią receptūrą,
 * žaliavos paskirstomos FIFO (anksčiausia galiojimo data).
 * Nepakanka partijos -> eilutė su material_batch_id = NULL (TRŪKSTA).
 */
class ProductionController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    public function index()
    {
        return Production::with(['productionProduct', 'lWeek', 'recipe'])
            ->withCount('usages')
            ->orderByDesc('production_date')
            ->orderByDesc('id')
            ->paginate(50);
    }

    public function show(int $id)
    {
        return Production::with([
            'productionProduct', 'lWeek', 'recipe.items.rawMaterial',
            'usages.rawMaterial', 'usages.materialBatch',
        ])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'production_date'       => 'required|date',
            'production_product_id' => 'required|exists:production_products,id',
            'qty_produced_kg'       => 'required|numeric|gt:0',
            'l_week_id'             => 'required|exists:l_weeks,id',
            'notes'                 => 'nullable|string|max:255',
        ]);

        $recipe = $this->resolveRecipe($data['production_product_id'], $data['production_date'], $data['l_week_id']);

        if (! $recipe) {
            return response()->json([
                'message' => 'Nėra galiojančios receptūros šiai gamybinei rūšiai nurodytai datai.',
            ], 422);
        }

        $production = DB::transaction(function () use ($data, $recipe, $request) {
            $production = Production::create([
                ...$data,
                'recipe_id'   => $recipe->id,
                'employee_id' => $request->user()?->id,
            ]);

            foreach ($recipe->items as $item) {
                $needed = round($item->qty_kg_per_kg * $production->qty_produced_kg, 3);
                if ($needed <= 0) {
                    continue;
                }
                foreach ($this->stock->allocateFifo($item->raw_material_id, $needed, $production->production_date->toDateString()) as $a) {
                    MaterialUsage::create([
                        'production_id'     => $production->id,
                        'raw_material_id'   => $item->raw_material_id,
                        'material_batch_id' => $a['batch_id'],
                        'qty_kg'            => $a['qty_kg'],
                    ]);
                }
            }

            return $production;
        });

        return response()->json(
            $production->load(['usages.rawMaterial', 'usages.materialBatch', 'recipe', 'lWeek']),
            201
        );
    }

    public function destroy(int $id)
    {
        // Naikinama gamyba atlaisvina sunaudotas partijas (usages cascade)
        Production::findOrFail($id)->delete();
        return response()->noContent();
    }

    /** Galiojanti receptūros versija: L-partijai skirta > naujausia galiojanti versija. */
    private function resolveRecipe(int $productId, string $date, int $lWeekId): ?Recipe
    {
        return Recipe::with('items')
            ->where('production_product_id', $productId)
            ->where('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $date))
            ->orderByRaw('CASE WHEN applies_to_l_week_id = ? THEN 0 ELSE 1 END', [$lWeekId])
            ->orderByDesc('version')
            ->first();
    }
}
