<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PackedProduct;
use App\Models\Recipe;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Receptūros (Excel "4 Receptūros") su eilutėmis.
 * POST /api/recipes priima items masyvą [{raw_material_id, qty_kg_per_kg}].
 */
class RecipeController extends Controller
{
    public function index()
    {
        return Recipe::with(['productionProduct', 'items.rawMaterial'])
            ->orderBy('production_product_id')->orderByDesc('version')
            ->get();
    }

    public function show(int $id)
    {
        return Recipe::with(['productionProduct', 'items.rawMaterial', 'approvedBy'])->findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'production_product_id' => 'required|exists:production_products,id',
            'valid_from'            => 'required|date',
            'valid_to'              => 'nullable|date|after_or_equal:valid_from',
            'applies_to_l_week_id'  => 'nullable|exists:l_weeks,id',
            'change_reason'         => 'nullable|string|max:255',
            'items'                 => 'required|array|min:1',
            'items.*.raw_material_id' => 'required|exists:raw_materials,id',
            'items.*.qty_kg_per_kg'   => 'required|numeric|gt:0',
        ]);

        $recipe = DB::transaction(function () use ($data, $request) {
            $nextVersion = Recipe::where('production_product_id', $data['production_product_id'])->max('version') + 1;

            $recipe = Recipe::create([
                'production_product_id' => $data['production_product_id'],
                'version'               => $nextVersion,
                'valid_from'            => $data['valid_from'],
                'valid_to'              => $data['valid_to'] ?? null,
                'applies_to_l_week_id'  => $data['applies_to_l_week_id'] ?? null,
                'change_reason'         => $data['change_reason'] ?? null,
                'approved_by_id'        => $request->user()?->id,
            ]);

            $recipe->items()->createMany($data['items']);

            return $recipe;
        });

        return response()->json($recipe->load('items.rawMaterial'), 201);
    }

    /** Fasavimo rūšies parinkimas pagal svorį (Priedas A automatinis parinkimas). */
    public function suggestPack(Request $request)
    {
        $request->validate(['weight_kg' => 'required|numeric|gt:0']);
        $weight = (float) $request->weight_kg;

        $match = PackedProduct::with('productionProduct')
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('weight_from_kg')->orWhere('weight_from_kg', '<=', $weight))
            ->where(fn ($q) => $q->whereNull('weight_to_kg')->orWhere('weight_to_kg', '>=', $weight))
            ->first();

        return $match
            ? $match
            : response()->json(['message' => 'Nerasta fasavimo rūšis šiam svoriui.'], 404);
    }
}
