<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialUsage;
use App\Models\Production;
use App\Models\ProductionProduct;
use App\Models\Recipe;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Gamyba (Excel "2 Gamyba"). Sukūrus gamybą automatiškai
 * generuojamas sunaudojimas pagal galiojančią receptūrą,
 * žaliavos paskirstomos FIFO (seniausiai gauta galiojanti partija).
 * Nepakanka partijos -> eilutė su material_batch_id = NULL (TRŪKSTA).
 * Išimtys (requires_batch=false, pvz. vanduo) - kiekis fiksuojamas, partija nereikalinga.
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
                $allocations = $item->rawMaterial->requires_batch
                    ? $this->stock->allocateFifo($item->raw_material_id, $needed, $production->production_date->toDateString())
                    : [['batch_id' => null, 'qty_kg' => $needed]];

                foreach ($allocations as $a) {
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

    /**
     * Gamybos peržiūra NIRAŠANT: parodo galiojančią receptūrą ir
     * iš kurių partijų (FIFO) būtų nurašoma. „Išpajamavo" - tik registruojant.
     */
    public function preview(Request $request)
    {
        $data = $request->validate([
            'production_date'       => 'required|date',
            'production_product_id' => 'required|exists:production_products,id',
            'qty_produced_kg'       => 'required|numeric|gt:0',
            'l_week_id'             => 'required|exists:l_weeks,id',
        ]);

        $recipe = $this->resolveRecipe($data['production_product_id'], $data['production_date'], $data['l_week_id']);

        if (! $recipe) {
            return response()->json([
                'message' => 'Nėra galiojančios receptūros šiai gamybinei rūšiai nurodytai datai.',
            ], 422);
        }

        $plan = $recipe->items->map(function ($item) use ($data) {
            $needed = round($item->qty_kg_per_kg * $data['qty_produced_kg'], 3);
            return [
                'raw_material' => $item->rawMaterial,
                'needed_kg'    => $needed,
                'take'         => $needed > 0 && $item->rawMaterial->requires_batch
                    ? $this->stock->plan($item->raw_material_id, $needed, $data['production_date'])
                    : [],
            ];
        });

        return [
            'recipe' => $recipe,
            'plan'   => $plan,
            'shortage' => $plan->contains(
                fn ($row) => collect($row['take'])->contains(fn ($a) => $a['batch'] === null)
            ),
        ];
    }

    /**
     * Pasirinkus gamybinę rūšį - visa jos informacija: galiojanti receptūra,
     * fasavimo rūšys (Priedas A), paskutinės gamybos ir bendras pagamintas kiekis.
     */
    public function productInfo(Request $request, int $id)
    {
        $data = $request->validate([
            'production_date' => 'nullable|date',
            'l_week_id'       => 'nullable|integer',
        ]);
        $product = ProductionProduct::with(['packedProducts' => fn ($q) => $q->orderBy('weight_from_kg')])->findOrFail($id);

        return [
            'product'     => $product,
            'recipe'      => $this->resolveRecipe($id, $data['production_date'] ?? today()->toDateString(), (int) ($data['l_week_id'] ?? 0)),
            'produced_kg' => (float) $product->productions()->sum('qty_produced_kg'),
            'recent'      => $product->productions()->with('lWeek')
                ->orderByDesc('production_date')->orderByDesc('id')->limit(5)->get(),
        ];
    }

    /** „Įspajamojimas": užrakinta gamyba negali būti naikinama (partijos lieka užfiksuotos). */
    public function lock(int $id)
    {
        return Production::findOrFail($id)->toggleLock();
    }

    public function destroy(int $id)
    {
        $production = Production::findOrFail($id);
        if ($production->is_locked) {
            return response()->json(['message' => 'Gamyba įspajamota (užrakinta) – naikinti negalima.'], 423);
        }
        // Naikinama gamyba atlaisvina sunaudotas partijas. Sunaudojimai trinami per Eloquent
        // (ne DB cascade), kad kiekvienas liktų istorijoje.
        DB::transaction(function () use ($production) {
            $production->usages->each->delete();
            $production->delete();
        });
        return response()->noContent();
    }

    /** Galiojanti receptūros versija: L-partijai skirta > naujausia galiojanti versija. */
    private function resolveRecipe(int $productId, string $date, int $lWeekId): ?Recipe
    {
        return Recipe::with('items.rawMaterial')
            ->where('production_product_id', $productId)
            ->where('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $date))
            ->orderByRaw('CASE WHEN applies_to_l_week_id = ? THEN 0 ELSE 1 END', [$lWeekId])
            ->orderByDesc('version')
            ->first();
    }
}
