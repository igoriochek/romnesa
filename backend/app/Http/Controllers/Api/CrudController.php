<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

/**
 * Bendras CRUD kontroleris visoms lentelėms.
 * Modelis nustatomas pagal URL segmentą (pvz. /api/raw-materials -> RawMaterial).
 */
class CrudController extends Controller
{
    private const RESOURCES = [
        'users'               => \App\Models\User::class,
        'raw-materials'       => \App\Models\RawMaterial::class,
        'production-products' => \App\Models\ProductionProduct::class,
        'packed-products'     => \App\Models\PackedProduct::class,
        'warehouses'          => \App\Models\Warehouse::class,
        'shops'               => \App\Models\Shop::class,
        'l-weeks'             => \App\Models\LWeek::class,
        'recipes'             => \App\Models\Recipe::class,
        'recipe-items'        => \App\Models\RecipeItem::class,
        'material-batches'    => \App\Models\MaterialBatch::class,
        'productions'         => \App\Models\Production::class,
        'material-usages'     => \App\Models\MaterialUsage::class,
        'material-outflows'   => \App\Models\MaterialOutflow::class,
        'product-movements'   => \App\Models\ProductMovement::class,
    ];

    // Minimalios validacijos taisyklės (privalomi laukai)
    private const RULES = [
        'raw-materials'       => ['name' => 'required|string|max:100'],
        'production-products' => ['name' => 'required|string|max:100'],
        'packed-products'     => ['name' => 'required|string|max:100', 'production_product_id' => 'required|exists:production_products,id'],
        'warehouses'          => ['name' => 'required|string|max:100'],
        'shops'               => ['name' => 'required|string|max:100'],
        'l-weeks'             => ['code' => 'required|string|max:10', 'week_number' => 'required|integer', 'year' => 'required|integer'],
        'recipes'             => ['production_product_id' => 'required|exists:production_products,id', 'valid_from' => 'required|date'],
        'recipe-items'        => ['recipe_id' => 'required|exists:recipes,id', 'raw_material_id' => 'required|exists:raw_materials,id', 'qty_kg_per_kg' => 'required|numeric'],
        'material-batches'    => ['received_date' => 'required|date', 'raw_material_id' => 'required|exists:raw_materials,id', 'batch_number' => 'required|string|max:50', 'qty_received_kg' => 'required|numeric', 'expiry_date' => 'required|date'],
        'productions'         => ['production_date' => 'required|date', 'production_product_id' => 'required|exists:production_products,id', 'qty_produced_kg' => 'required|numeric', 'l_week_id' => 'required|exists:l_weeks,id'],
        'material-usages'     => ['production_id' => 'required|exists:productions,id', 'raw_material_id' => 'required|exists:raw_materials,id', 'qty_kg' => 'required|numeric'],
        'material-outflows'   => ['outflow_date' => 'required|date', 'material_batch_id' => 'required|exists:material_batches,id', 'qty_kg' => 'required|numeric', 'outflow_type' => 'required|in:transfer,writeoff'],
        'product-movements'   => ['movement_date' => 'required|date', 'movement_type' => 'required|in:pack_in,move,ship_out', 'l_week_id' => 'required|exists:l_weeks,id', 'packed_product_id' => 'required|exists:packed_products,id', 'qty_units' => 'required|integer', 'qty_kg' => 'required|numeric'],
    ];

    private function model(Request $request): string
    {
        $segment = $request->segment(2);
        abort_unless(isset(self::RESOURCES[$segment]), 404, 'Unknown resource');
        return self::RESOURCES[$segment];
    }

    public function index(Request $request)
    {
        return $this->model($request)::query()->orderByDesc('id')->paginate(50);
    }

    public function show(Request $request, int $id)
    {
        return $this->model($request)::findOrFail($id);
    }

    public function store(Request $request)
    {
        $rules = self::RULES[$request->segment(2)] ?? [];
        $data = $rules ? $request->validate($rules) : $request->all();
        return response()->json($this->model($request)::create($data), 201);
    }

    public function update(Request $request, int $id)
    {
        $record = $this->model($request)::findOrFail($id);
        $rules = collect(self::RULES[$request->segment(2)] ?? [])->mapWithKeys(
            fn ($rule, $field) => [$field => 'sometimes|' . str_replace('required|', '', $rule)]
        )->all();
        $record->update($rules ? $request->validate($rules) : $request->all());
        return $record;
    }

    public function destroy(Request $request, int $id)
    {
        $this->model($request)::findOrFail($id)->delete();
        return response()->noContent();
    }
}
