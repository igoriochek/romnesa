<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PackedProduct;
use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Receptūros (Excel "4 Receptūros") su eilutėmis.
 * POST/PUT /api/recipes priima items masyvą [{raw_material_id, qty_kg_per_kg}] - eilučių tvarka išsaugoma.
 */
class RecipeController extends Controller
{
    public function index()
    {
        return Recipe::with(['productionProduct', 'items.rawMaterial'])
            ->withCount('productions')
            ->orderBy('production_product_id')->orderByDesc('version')
            ->get();
    }

    public function show(int $id)
    {
        return Recipe::with(['productionProduct', 'items.rawMaterial', 'approvedBy'])->withCount('productions')->findOrFail($id);
    }

    private function rules(?int $ignoreId = null, ?int $productId = null): array
    {
        return [
            'production_product_id'   => 'required|exists:production_products,id',
            'version'                 => [
                'nullable', 'integer', 'min:1',
                Rule::unique('recipes')->where('production_product_id', $productId)->ignore($ignoreId),
            ],
            'valid_from'              => 'required|date',
            'valid_to'                => 'nullable|date|after_or_equal:valid_from',
            'applies_to_l_week_id'    => 'nullable|exists:l_weeks,id',
            'change_reason'           => 'nullable|string|max:255',
            'items'                   => 'required|array|min:1',
            'items.*.raw_material_id' => 'required|distinct|exists:raw_materials,id',
            'items.*.qty_kg_per_kg'   => 'required|numeric|gt:0',
        ];
    }

    private const MESSAGES = [
        'version.unique' => 'Ši versija šiai rūšiai jau yra.',
        'items.*.raw_material_id.distinct' => 'Ta pati žaliava receptūroje kartojasi.',
        'items.required' => 'Receptūroje turi būti bent viena žaliava.',
    ];

    public function store(Request $request)
    {
        $data = $request->validate($this->rules(null, (int) $request->input('production_product_id')), self::MESSAGES);

        $recipe = DB::transaction(function () use ($data, $request) {
            $version = $data['version'] ?? Recipe::where('production_product_id', $data['production_product_id'])->max('version') + 1;

            $recipe = Recipe::create([
                'production_product_id' => $data['production_product_id'],
                'version'               => $version,
                'valid_from'            => $data['valid_from'],
                'valid_to'              => $data['valid_to'] ?? null,
                'applies_to_l_week_id'  => $data['applies_to_l_week_id'] ?? null,
                'change_reason'         => $data['change_reason'] ?? null,
                'approved_by_id'        => $request->user()?->id,
            ]);
            $this->saveItems($recipe, $data['items']);

            return $recipe;
        });

        return response()->json($recipe->load(['productionProduct', 'items.rawMaterial'])->loadCount('productions'), 201);
    }

    /** Receptūros taisymas: antraštė + eilutės (pakeičiamos visos). Jau užregistruotų gamybų sunaudojimas nesikeičia. */
    public function update(Request $request, int $id)
    {
        $recipe = Recipe::findOrFail($id);
        $data = $request->validate($this->rules($recipe->id, (int) $request->input('production_product_id')), self::MESSAGES);

        DB::transaction(function () use ($recipe, $data) {
            $recipe->update([
                'production_product_id' => $data['production_product_id'],
                'version'               => $data['version'] ?? $recipe->version,
                'valid_from'            => $data['valid_from'],
                'valid_to'              => $data['valid_to'] ?? null,
                'applies_to_l_week_id'  => $data['applies_to_l_week_id'] ?? null,
                'change_reason'         => $data['change_reason'] ?? null,
            ]);
            $recipe->items()->delete();
            $this->saveItems($recipe, $data['items']);
        });

        return $recipe->fresh(['productionProduct', 'items.rawMaterial'])->loadCount('productions');
    }

    /** Naudotos gamyboje receptūros netrinamos - atsekamumui reikia žinoti, pagal ką gaminta. */
    public function destroy(int $id)
    {
        $recipe = Recipe::withCount('productions')->findOrFail($id);
        if ($recipe->productions_count > 0) {
            return response()->json([
                'message' => "Receptūra panaudota {$recipe->productions_count} gamybose – trinti negalima. Galite ją redaguoti arba nustatyti „Galioja iki“.",
            ], 422);
        }
        DB::transaction(function () use ($recipe) {
            $recipe->items()->delete();
            $recipe->delete();
        });

        return response()->noContent();
    }

    private function saveItems(Recipe $recipe, array $items): void
    {
        foreach (array_values($items) as $i => $item) {
            $recipe->items()->create([
                'raw_material_id' => $item['raw_material_id'],
                'qty_kg_per_kg'   => $item['qty_kg_per_kg'],
                'sort_order'      => $i + 1,
            ]);
        }
    }

    /** Fasavimo rūšies parinkimas pagal svorį (Priedas A automatinis parinkimas). */
    public function suggestPack(Request $request)
    {
        $request->validate(['weight_kg' => 'required|numeric|gt:0']);
        $weight = (float) $request->weight_kg;

        $match = PackedProduct::with('productionProduct')
            ->where('is_active', true)
            ->whereNotNull('weight_from_kg')->whereNotNull('weight_to_kg')
            ->where('weight_from_kg', '<=', $weight)
            ->where('weight_to_kg', '>=', $weight)
            ->orderBy('sort_order')
            ->first();

        return $match
            ? $match
            : response()->json(['message' => 'Nerasta fasavimo rūšis šiam svoriui.'], 404);
    }
}
