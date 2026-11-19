<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialUsage;
use App\Models\Production;
use App\Models\RecipeAdjustment;
use App\Services\ProductionService;
use Illuminate\Http\Request;

/**
 * Mėnesio sunaudojimo korekcijos („individuali kortelė").
 * Pagrindinė receptūra lieka nepakitusi; korekcija keičia vienos žaliavos normą
 * tik gamyboms, kurių data patenka į korekcijos laikotarpį (spalio korekcija lapkričio neliečia).
 * Korekciją galima taisyti, kol ji neįspajamota. Pritaikoma per „Perskaičiuoti" (visas sunaudojimas).
 */
class RecipeAdjustmentController extends Controller
{
    public function __construct(private ProductionService $productions) {}

    public function index(Request $request)
    {
        $f = $request->validate([
            'from' => 'nullable|date',
            'to'   => 'nullable|date',
            'production_product_id' => 'nullable|integer',
        ]);

        return RecipeAdjustment::with(['productionProduct', 'rawMaterial'])
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('valid_to', '>=', $d))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('valid_from', '<=', $d))
            ->when($f['production_product_id'] ?? null, fn ($q, $id) => $q->where('production_product_id', $id))
            ->orderByDesc('valid_from')->orderBy('production_product_id')->orderBy('id')
            ->get()
            ->map(fn ($a) => $this->withBase($a));
    }

    /**
     * Pagalba sprendimui: kiek pagaminta per laikotarpį, kokia pagrindinė norma,
     * kiek žaliavos dabar nurašyta ir kiek TRŪKSTA. Siūloma norma = faktinis sunaudojimas / pagaminta.
     */
    public function context(Request $request)
    {
        $f = $request->validate([
            'production_product_id' => 'required|exists:production_products,id',
            'raw_material_id'       => 'required|exists:raw_materials,id',
            'from'                  => 'required|date',
            'to'                    => 'required|date|after_or_equal:from',
        ]);
        $productions = Production::where('production_product_id', $f['production_product_id'])
            ->whereBetween('production_date', [$f['from'], $f['to']]);
        $ids = (clone $productions)->pluck('id');
        $usages = MaterialUsage::whereIn('production_id', $ids)->where('raw_material_id', $f['raw_material_id']);
        $recipe = $this->productions->resolveRecipe($f['production_product_id'], $f['from'], 0);

        return [
            'productions'    => $ids->count(),
            'locked'         => (clone $productions)->where('is_locked', true)->count(),
            'produced_kg'    => round((float) (clone $productions)->sum('qty_produced_kg'), 3),
            'base_qty_kg_per_kg' => $recipe ? (float) optional($recipe->items->firstWhere('raw_material_id', (int) $f['raw_material_id']))->qty_kg_per_kg : null,
            'recipe_version' => $recipe?->version,
            'used_kg'        => round((float) (clone $usages)->sum('qty_kg'), 3),
            'shortage_kg'    => round((float) (clone $usages)->whereNull('material_batch_id')->sum('qty_kg'), 3),
        ];
    }

    private function rules(): array
    {
        return [
            'production_product_id' => 'required|exists:production_products,id',
            'raw_material_id'       => 'required|exists:raw_materials,id',
            'valid_from'            => 'required|date',
            'valid_to'              => 'required|date|after_or_equal:valid_from',
            'qty_kg_per_kg'         => 'required|numeric|min:0|max:10',
            'reason'                => 'nullable|string|max:255',
        ];
    }

    /** Ta pati rūšis + žaliava negali turėti persidengiančių korekcijų. */
    private function overlaps(array $d, ?int $ignoreId = null): bool
    {
        return RecipeAdjustment::where('production_product_id', $d['production_product_id'])
            ->where('raw_material_id', $d['raw_material_id'])
            ->where('valid_from', '<=', $d['valid_to'])->where('valid_to', '>=', $d['valid_from'])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
    }

    private const OVERLAP = 'Šiai rūšiai ir žaliavai tame laikotarpyje korekcija jau yra – pataisykite esamą.';

    public function store(Request $request)
    {
        $d = $request->validate($this->rules());
        if ($this->overlaps($d)) {
            return response()->json(['message' => self::OVERLAP], 422);
        }
        $a = RecipeAdjustment::create([...$d, 'created_by_id' => $request->user()?->id]);

        return response()->json($this->withBase($a->load(['productionProduct', 'rawMaterial'])), 201);
    }

    public function update(Request $request, int $id)
    {
        $a = RecipeAdjustment::findOrFail($id);
        if ($a->is_locked) {
            return response()->json(['message' => 'Korekcija įspajamota – pirma atrakinkite.'], 423);
        }
        $d = $request->validate($this->rules());
        if ($this->overlaps($d, $a->id)) {
            return response()->json(['message' => self::OVERLAP], 422);
        }
        $a->update($d);

        return $this->withBase($a->load(['productionProduct', 'rawMaterial']));
    }

    public function lock(int $id)
    {
        return $this->withBase(RecipeAdjustment::with(['productionProduct', 'rawMaterial'])->findOrFail($id)->toggleLock());
    }

    public function destroy(int $id)
    {
        $a = RecipeAdjustment::findOrFail($id);
        if ($a->is_locked) {
            return response()->json(['message' => 'Korekcija įspajamota – trinti negalima.'], 423);
        }
        $a->delete();

        return response()->noContent();
    }

    /** Pagrindinės receptūros norma laikotarpio pradžioje - palyginimui. */
    private function withBase(RecipeAdjustment $a): RecipeAdjustment
    {
        $recipe = $this->productions->resolveRecipe($a->production_product_id, $a->valid_from->toDateString(), 0);
        $item = $recipe?->items->firstWhere('raw_material_id', $a->raw_material_id);
        $a->base_qty_kg_per_kg = $item ? (float) $item->qty_kg_per_kg : null;

        return $a;
    }
}
