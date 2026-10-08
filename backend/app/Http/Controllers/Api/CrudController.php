<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;

/**
 * Bendras CRUD kontroleris klasifikatoriams.
 * Modelis nustatomas pagal URL segmentą (pvz. /api/raw-materials -> RawMaterial).
 * Apskaitos lentelės (partijos, gamyba, judėjimai...) turi savo kontrolerius.
 */
class CrudController extends Controller
{
    private const RESOURCES = [
        'raw-materials'       => \App\Models\RawMaterial::class,
        'production-products' => \App\Models\ProductionProduct::class,
        'packed-products'     => \App\Models\PackedProduct::class,
        'warehouses'          => \App\Models\Warehouse::class,
        'shops'               => \App\Models\Shop::class,
        'l-weeks'             => \App\Models\LWeek::class,
        'recipe-items'        => \App\Models\RecipeItem::class,
    ];

    // Minimalios validacijos taisyklės (privalomi laukai)
    private const RULES = [
        'raw-materials'       => ['name' => 'required|string|max:100'],
        'production-products' => ['name' => 'required|string|max:100'],
        'packed-products'     => ['name' => 'required|string|max:100', 'production_product_id' => 'required|exists:production_products,id'],
        'warehouses'          => ['name' => 'required|string|max:100'],
        'shops'               => ['name' => 'required|string|max:100'],
        'l-weeks'             => ['code' => 'required|string|max:10', 'week_number' => 'required|integer', 'year' => 'required|integer'],
        'recipe-items'        => ['recipe_id' => 'required|exists:recipes,id', 'raw_material_id' => 'required|exists:raw_materials,id', 'qty_kg_per_kg' => 'required|numeric'],
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
        $data = $request->validate(self::RULES[$request->segment(2)]);
        return $this->constrained(fn () => response()->json($this->model($request)::create($data), 201));
    }

    public function update(Request $request, int $id)
    {
        $record = $this->model($request)::findOrFail($id);
        $rules = collect(self::RULES[$request->segment(2)])->mapWithKeys(
            fn ($rule, $field) => [$field => 'sometimes|' . str_replace('required|', '', $rule)]
        )->all();
        return $this->constrained(fn () => tap($record)->update($request->validate($rules)));
    }

    public function destroy(Request $request, int $id)
    {
        $record = $this->model($request)::findOrFail($id);
        return $this->constrained(function () use ($record) {
            $record->delete();
            return response()->noContent();
        });
    }

    /** DB apribojimų pažeidimai (dublikatas, naudojamas įrašas) -> 422 vietoj 500. */
    private function constrained(callable $fn)
    {
        try {
            return $fn();
        } catch (UniqueConstraintViolationException) {
            return response()->json(['message' => 'Toks įrašas jau egzistuoja.'], 422);
        } catch (QueryException $e) {
            if (($e->errorInfo[0] ?? null) === '23000') {
                return response()->json(['message' => 'Įrašas naudojamas kituose įrašuose – naikinti negalima.'], 422);
            }
            throw $e;
        }
    }
}
