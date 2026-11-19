<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        'packaging-materials' => \App\Models\PackagingMaterial::class,
    ];

    /** Klasifikatoriai su vartotojo nustatoma tvarka (tempimas pele). */
    private const SORTABLE = ['raw-materials', 'production-products', 'packed-products', 'warehouses', 'shops', 'packaging-materials'];

    // Minimalios validacijos taisyklės (privalomi laukai)
    private const RULES = [
        'raw-materials'       => ['name' => 'required|string|max:100', 'code' => 'nullable|string|max:20', 'requires_batch' => 'boolean'],
        'production-products' => ['name' => 'required|string|max:100'],
        'packed-products'     => [
            'name' => 'required|string|max:100',
            'production_product_id' => 'required|exists:production_products,id',
            'weight_from_kg' => 'nullable|numeric|min:0|max:999',
            'weight_to_kg' => 'nullable|numeric|min:0|max:999',
        ],
        'warehouses'          => ['name' => 'required|string|max:100'],
        'shops'               => ['name' => 'required|string|max:100'],
        'l-weeks'             => ['code' => 'required|string|max:10', 'week_number' => 'required|integer', 'year' => 'required|integer'],
        'packaging-materials' => ['name' => 'required|string|max:100', 'unit' => 'required|in:vnt,m,kg', 'kind' => 'sometimes|required|in:item,box,overlay', 'pack_qty' => 'nullable|numeric|gt:0'],
    ];

    private function model(Request $request): string
    {
        $segment = $request->segment(2);
        abort_unless(isset(self::RESOURCES[$segment]), 404, 'Unknown resource');
        return self::RESOURCES[$segment];
    }

    private function sortable(Request $request): bool
    {
        return in_array($request->segment(2), self::SORTABLE, true);
    }

    public function index(Request $request)
    {
        $perPage = min(max((int) $request->query('per_page', 200), 1), 500);
        $query = $this->model($request)::query();
        $this->sortable($request)
            ? $query->orderBy('sort_order')->orderBy('name')
            : $query->orderByDesc('id');

        return $query->paginate($perPage);
    }

    public function show(Request $request, int $id)
    {
        return $this->model($request)::findOrFail($id);
    }

    public function store(Request $request)
    {
        $data = $request->validate(self::RULES[$request->segment(2)]);
        if (! $this->validWeights($data)) {
            return response()->json(['message' => 'Svoris „nuo“ negali būti didesnis už „iki“.'], 422);
        }
        // naujas įrašas - sąrašo gale
        if ($this->sortable($request)) {
            $data['sort_order'] = (int) $this->model($request)::max('sort_order') + 1;
        }
        return $this->constrained(fn () => response()->json($this->model($request)::create($data), 201));
    }

    public function update(Request $request, int $id)
    {
        $record = $this->model($request)::findOrFail($id);
        $rules = collect(self::RULES[$request->segment(2)])->mapWithKeys(
            fn ($rule, $field) => [$field => 'sometimes|' . str_replace('required|', '', $rule)]
        )->all();
        $data = $request->validate($rules);
        if (! $this->validWeights([...$record->only(['weight_from_kg', 'weight_to_kg']), ...$data])) {
            return response()->json(['message' => 'Svoris „nuo“ negali būti didesnis už „iki“.'], 422);
        }
        return $this->constrained(fn () => tap($record)->update($data));
    }

    public function destroy(Request $request, int $id)
    {
        $record = $this->model($request)::findOrFail($id);
        // gamybinės rūšies receptūros ir fasavimo rūšys DB lygiu trinamos kaskadu - neleidžiam jų prarasti netyčia
        if ($record instanceof \App\Models\ProductionProduct
            && (\App\Models\Recipe::where('production_product_id', $id)->exists()
                || \App\Models\PackedProduct::where('production_product_id', $id)->exists())) {
            return response()->json(['message' => 'Rūšis turi receptūrų arba fasavimo rūšių – pirma pašalinkite jas.'], 422);
        }
        return $this->constrained(function () use ($record) {
            $record->delete();
            return response()->noContent();
        });
    }

    /** Nauja tvarka: ids - įrašų id ta tvarka, kuria jie rodomi. */
    public function reorder(Request $request)
    {
        abort_unless($this->sortable($request), 404);
        $ids = $request->validate(['ids' => 'required|array', 'ids.*' => 'integer'])['ids'];
        $model = $this->model($request);
        DB::transaction(function () use ($ids, $model) {
            foreach (array_values($ids) as $i => $id) {
                $model::whereKey($id)->update(['sort_order' => $i + 1]);
            }
        });

        return response()->noContent();
    }

    private function validWeights(array $d): bool
    {
        return ! isset($d['weight_from_kg'], $d['weight_to_kg'])
            || (float) $d['weight_from_kg'] <= (float) $d['weight_to_kg'];
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
