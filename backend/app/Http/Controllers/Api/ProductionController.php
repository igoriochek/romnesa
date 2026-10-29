<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Production;
use App\Models\ProductionProduct;
use App\Services\CostService;
use App\Services\MaterialStockService;
use App\Services\ProductionService;
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
    public function __construct(
        private MaterialStockService $stock,
        private ProductionService $productions,
    ) {}

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 50), 1), 500);

        $productions = Production::with(['productionProduct', 'lWeek', 'recipe', 'usages.materialBatch', 'usages.rawMaterial'])
            ->withCount('usages')
            ->orderByDesc('production_date')
            ->orderByDesc('id')
            ->paginate($perPage);

        // usages reikalingi tik savikainai - į sąrašo atsakymą jų nededame
        $productions->getCollection()->transform(fn ($p) => $p->withCost()->makeHidden('usages'));

        return $productions;
    }

    public function show(int $id)
    {
        return Production::with([
            'productionProduct', 'lWeek', 'recipe.items.rawMaterial',
            'usages.rawMaterial', 'usages.materialBatch',
        ])->findOrFail($id)->withCost(details: true);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'production_date'       => 'required|date',
            'production_product_id' => 'required|exists:production_products,id',
            'qty_produced_kg'       => 'required|numeric|gt:0',
            'l_week_id'             => 'required|exists:l_weeks,id',
            'notes'                 => 'nullable|string|max:255',
            // Neprivaloma: vartotojo pakeistas planas (žaliava -> partijos). Nenurodytoms žaliavoms - FIFO.
            'allocations'                        => 'nullable|array',
            'allocations.*.raw_material_id'      => 'required|integer',
            'allocations.*.material_batch_id'    => 'required|integer',
            'allocations.*.qty_kg'               => 'required|numeric|min:0',
        ]);
        $manual = collect($data['allocations'] ?? [])->groupBy('raw_material_id');
        unset($data['allocations']);

        $recipe = $this->productions->resolveRecipe($data['production_product_id'], $data['production_date'], $data['l_week_id']);

        if (! $recipe) {
            return response()->json([
                'message' => 'Nėra galiojančios receptūros šiai gamybinei rūšiai nurodytai datai.',
            ], 422);
        }

        $production = $this->productions->create($data, $recipe, $manual, $request->user()?->id);

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

        $recipe = $this->productions->resolveRecipe($data['production_product_id'], $data['production_date'], $data['l_week_id']);

        if (! $recipe) {
            return response()->json([
                'message' => 'Nėra galiojančios receptūros šiai gamybinei rūšiai nurodytai datai.',
            ], 422);
        }

        $plan = $recipe->items->map(function ($item) use ($data) {
            $needed = round($item->qty_kg_per_kg * $data['qty_produced_kg'], 3);
            $withBatch = $needed > 0 && $item->rawMaterial->requires_batch;
            return [
                'raw_material' => $item->rawMaterial,
                'needed_kg'    => $needed,
                'take'         => $withBatch ? $this->stock->plan($item->raw_material_id, $needed, $data['production_date']) : [],
                // visos tą dieną tinkamos partijos su likučiu - planą galima pakeisti rankiniu būdu
                'options'      => $withBatch
                    ? $this->stock->eligibleBatches($item->raw_material_id, $data['production_date'])
                        ->map(fn ($b) => $this->stock->withTotals($b))
                        ->filter(fn ($b) => $b->balance_kg > 0)
                        ->values()
                    : [],
            ];
        });

        return [
            'recipe' => $recipe,
            // normatyvinė žaliavų savikaina pagal orientacines kainas gamybos dienai
            'recipe_cost' => app(CostService::class)->recipe($recipe, $data['production_date']),
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
        $date = $data['production_date'] ?? today('Europe/Vilnius')->toDateString();
        $recipe = $this->productions->resolveRecipe($id, $date, (int) ($data['l_week_id'] ?? 0));

        return [
            'product'     => $product,
            'recipe'      => $recipe,
            'recipe_cost' => $recipe ? app(CostService::class)->recipe($recipe, $date) : null,
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
}
