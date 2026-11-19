<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PackagingBatch;
use App\Models\PackagingMaterial;
use App\Models\PackedProduct;
use App\Models\Packing;
use App\Models\PackingSpec;
use App\Models\ProductMovement;
use App\Models\TransportNorm;
use App\Services\ProductStockService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Pakavimas: pakuočių gavimas (partijos), pakavimo specifikacijos,
 * pakuotų šakočių registravimas su pakavimo medžiagų sunaudojimu ir likučiai.
 * Pakavimas sukuria fasavimo papildymo (pack_in) judėjimą - produkto likutis sandėlyje.
 */
class PackagingController extends Controller
{
    public function __construct(private ProductStockService $stock) {}

    // ---------- Pakuočių gavimas (partijos) ----------

    /** Partijos su likučiu (gauta - sunaudota). */
    public function batches(Request $request)
    {
        $batches = PackagingBatch::with('packagingMaterial')
            ->withSum('usages', 'qty')
            ->when($request->query('packaging_material_id'), fn ($q, $id) => $q->where('packaging_material_id', $id))
            ->orderByDesc('received_date')->orderByDesc('id')
            ->get();

        return $batches->map(fn (PackagingBatch $b) => $this->withBalance($b));
    }

    private function withBalance(PackagingBatch $b): PackagingBatch
    {
        $used = (float) ($b->usages_sum_qty ?? $b->usages()->sum('qty'));
        $b->used = round($used, 3);
        $b->balance = round((float) $b->qty_received - $used, 3);
        $b->balance_value_eur = $b->unit_cost_eur === null ? null : round($b->balance * (float) $b->unit_cost_eur, 2);
        $b->makeHidden('usages_sum_qty');

        return $b;
    }

    private function batchRules(?int $ignoreId = null): array
    {
        return [
            'received_date'         => 'required|date',
            'packaging_material_id' => 'required|exists:packaging_materials,id',
            'batch_number'          => ['required', 'string', 'max:50', Rule::unique('packaging_batches')->ignore($ignoreId)],
            'qty_received'          => 'required|numeric|gt:0',
            'unit_cost_eur'         => 'nullable|numeric|min:0',
            'supplier'              => 'nullable|string|max:150',
            'invoice_number'        => 'nullable|string|max:50',
            'notes'                 => 'nullable|string|max:255',
        ];
    }

    public function storeBatch(Request $request)
    {
        $data = $request->validate($this->batchRules(), ['batch_number.unique' => 'Toks partijos Nr. jau yra.']);
        $data['created_by_id'] = $request->user()?->id;

        return response()->json($this->withBalance(PackagingBatch::create($data)->load('packagingMaterial')), 201);
    }

    public function updateBatch(Request $request, int $id)
    {
        $batch = PackagingBatch::findOrFail($id);
        if ($batch->is_locked) {
            return response()->json(['message' => 'Partija įspajamota (užrakinta) – taisyti negalima.'], 423);
        }
        $data = $request->validate($this->batchRules($batch->id), ['batch_number.unique' => 'Toks partijos Nr. jau yra.']);
        $used = (float) $batch->usages()->sum('qty');
        if ((float) $data['qty_received'] < $used) {
            return response()->json(['message' => "Iš partijos jau sunaudota {$used} – gautas kiekis negali būti mažesnis."], 422);
        }
        if ((int) $data['packaging_material_id'] !== $batch->packaging_material_id && $used > 0) {
            return response()->json(['message' => 'Partija jau naudota pakuojant – medžiagos keisti negalima.'], 422);
        }
        $batch->update($data);

        return $this->withBalance($batch->load('packagingMaterial'));
    }

    public function destroyBatch(int $id)
    {
        $batch = PackagingBatch::findOrFail($id);
        if ($batch->is_locked) {
            return response()->json(['message' => 'Partija įspajamota (užrakinta) – naikinti negalima.'], 423);
        }
        if ($batch->usages()->exists()) {
            return response()->json(['message' => 'Partija jau naudota pakuojant – naikinti negalima.'], 422);
        }
        $batch->delete();

        return response()->noContent();
    }

    public function lockBatch(int $id)
    {
        return PackagingBatch::findOrFail($id)->toggleLock();
    }

    // ---------- Likučiai ----------

    /** Kiekvienos pakavimo medžiagos likutis ir vertė. */
    public function stock()
    {
        $batches = $this->batches(new Request())->groupBy('packaging_material_id');

        return PackagingMaterial::orderBy('sort_order')->orderBy('name')->get()->map(function ($m) use ($batches) {
            $bs = $batches->get($m->id, collect());
            $priced = $bs->filter(fn ($b) => $b->unit_cost_eur !== null);

            return [
                'packaging_material_id' => $m->id,
                'name'          => $m->name,
                'unit'          => $m->unit,
                'is_active'     => $m->is_active,
                'batches'       => $bs->count(),
                'received'      => round($bs->sum('qty_received'), 3),
                'used'          => round($bs->sum('used'), 3),
                'balance'       => round($bs->sum('balance'), 3),
                'balance_value_eur' => $priced->isEmpty() ? null : round($priced->sum('balance_value_eur'), 2),
                'value_complete' => $priced->count() === $bs->count(),
            ];
        });
    }

    // ---------- Specifikacijos ----------

    /** Visų fasavimo rūšių specifikacijos (rūšis -> medžiagos 1 vnt.). */
    public function specs()
    {
        return PackedProduct::with(['productionProduct', 'specs.packagingMaterial'])
            ->orderBy('sort_order')->orderBy('name')->get();
    }

    /** Fasavimo rūšies specifikacija pakeičiama visa (eilučių tvarka išsaugoma). */
    public function saveSpecs(Request $request, int $packedProductId)
    {
        $product = PackedProduct::findOrFail($packedProductId);
        $data = $request->validate([
            'items'                         => 'present|array',
            'items.*.packaging_material_id' => 'required|distinct|exists:packaging_materials,id',
            'items.*.qty_per_unit'          => 'required|numeric|gt:0',
        ], ['items.*.packaging_material_id.distinct' => 'Ta pati medžiaga kartojasi.']);

        DB::transaction(function () use ($product, $data) {
            PackingSpec::where('packed_product_id', $product->id)->delete();
            foreach (array_values($data['items']) as $i => $item) {
                PackingSpec::create([
                    'packed_product_id'     => $product->id,
                    'packaging_material_id' => $item['packaging_material_id'],
                    'qty_per_unit'          => $item['qty_per_unit'],
                    'sort_order'            => $i + 1,
                ]);
            }
        });

        return $product->load(['productionProduct', 'specs.packagingMaterial']);
    }

    // ---------- Transportinės pakuotės normos ----------

    public function norms()
    {
        return TransportNorm::with(['packedProduct', 'shop', 'boxMaterial', 'overlayMaterial'])
            ->orderBy('sort_order')->orderBy('id')->get();
    }

    private function normData(Request $request): array
    {
        $data = $request->validate([
            'packed_product_id'   => 'required|exists:packed_products,id',
            'shop_id'             => 'nullable|exists:shops,id',
            'box_material_id'     => 'required|exists:packaging_materials,id',
            'units_per_box'       => 'nullable|numeric|gt:0',
            'overlay_material_id' => 'nullable|exists:packaging_materials,id',
            'overlays_per_box'    => 'nullable|numeric|min:0',
            'notes'               => 'nullable|string|max:255',
        ]);
        $data['overlays_per_box'] = empty($data['overlay_material_id']) ? 0 : ($data['overlays_per_box'] ?? 1);

        return $data;
    }

    private function normDuplicate(array $data, ?int $ignoreId = null)
    {
        $dup = TransportNorm::where('packed_product_id', $data['packed_product_id'])
            ->where(fn ($q) => empty($data['shop_id']) ? $q->whereNull('shop_id') : $q->where('shop_id', $data['shop_id']))
            ->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists();

        return $dup ? response()->json(['message' => 'Šiai fasavimo rūšiai ir pirkėjui norma jau yra.'], 422) : null;
    }

    public function storeNorm(Request $request)
    {
        $data = $this->normData($request);
        if ($r = $this->normDuplicate($data)) {
            return $r;
        }
        $data['sort_order'] = (int) TransportNorm::max('sort_order') + 1;

        return response()->json(TransportNorm::create($data)->load(['packedProduct', 'shop', 'boxMaterial', 'overlayMaterial']), 201);
    }

    public function updateNorm(Request $request, int $id)
    {
        $norm = TransportNorm::findOrFail($id);
        $data = $this->normData($request);
        if ($r = $this->normDuplicate($data, $norm->id)) {
            return $r;
        }
        $norm->update($data);

        return $norm->load(['packedProduct', 'shop', 'boxMaterial', 'overlayMaterial']);
    }

    public function destroyNorm(int $id)
    {
        TransportNorm::findOrFail($id)->delete();

        return response()->noContent();
    }

    public function reorderNorms(Request $request)
    {
        $ids = $request->validate(['ids' => 'required|array', 'ids.*' => 'integer'])['ids'];
        DB::transaction(function () use ($ids) {
            foreach (array_values($ids) as $i => $id) {
                TransportNorm::whereKey($id)->update(['sort_order' => $i + 1]);
            }
        });

        return response()->noContent();
    }

    // ---------- Pakavimas ----------

    public function index(Request $request)
    {
        $rows = Packing::with(['lWeek', 'packedProduct.productionProduct', 'warehouse', 'shop', 'sourcePackedProduct', 'sourceWarehouse', 'usages.packagingMaterial', 'usages.packagingBatch'])
            ->when($request->query('from'), fn ($q, $d) => $q->where('packing_date', '>=', $d))
            ->when($request->query('to'), fn ($q, $d) => $q->where('packing_date', '<=', $d))
            ->when($request->query('production_product_id'), fn ($q, $id) => $q->whereHas('packedProduct', fn ($p) => $p->where('production_product_id', $id)))
            ->orderByDesc('packing_date')->orderByDesc('id')
            ->limit(min(max((int) $request->query('limit', 300), 1), 2000))
            ->get();

        return $rows->map(fn (Packing $p) => $this->withCost($p));
    }

    /** Pakavimo savikaina = Σ kiekis × partijos kaina; be kainos / be partijos - neįskaičiuojama (complete=false). */
    private function withCost(Packing $p): Packing
    {
        $total = 0.0;
        $complete = true;
        foreach ($p->usages as $u) {
            $unit = $u->packagingBatch?->unit_cost_eur;
            $u->unit_cost_eur = $unit === null ? null : (float) $unit;
            $u->cost_eur = $unit === null ? null : round((float) $u->qty * (float) $unit, 2);
            if ($unit === null) {
                $complete = false;
            } else {
                $total += (float) $u->qty * (float) $unit;
            }
        }
        $p->cost_eur = round($total, 2);
        $p->cost_complete = $complete;
        $p->cost_per_unit_eur = $p->qty_units > 0 ? round($total / $p->qty_units, 4) : null;

        return $p;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'packing_date'                   => 'required|date',
            'l_week_id'                      => 'required|exists:l_weeks,id',
            'packed_product_id'              => 'required|exists:packed_products,id',
            'unit_weight_kg'                 => 'required|numeric|gt:0|max:100',
            'qty_units'                      => 'required|integer|gt:0',
            'warehouse_id'                   => 'required|exists:warehouses,id',
            'notes'                          => 'nullable|string|max:255',
            'shop_id'                        => 'nullable|exists:shops,id',
            'boxes'                          => 'nullable|integer|min:0',
            // perpakavimas: iš kurios fasavimo rūšies ir sandėlio paimami jau supakuoti vienetai (ta pati L partija)
            'source_packed_product_id'       => 'nullable|exists:packed_products,id|different:packed_product_id',
            'source_warehouse_id'            => 'nullable|required_with:source_packed_product_id|exists:warehouses,id',
            'usages'                         => 'present|array',
            'usages.*.packaging_material_id' => 'required|exists:packaging_materials,id',
            'usages.*.packaging_batch_id'    => 'nullable|exists:packaging_batches,id',
            'usages.*.qty'                   => 'required|numeric|gt:0',
        ]);

        $packing = DB::transaction(function () use ($data, $request) {
            // partijų likučiai tikrinami užrakinus - lygiagretus pakavimas nepaims to paties likučio
            $batchIds = collect($data['usages'])->pluck('packaging_batch_id')->filter()->unique();
            /** @var Collection<int, PackagingBatch> $batches */
            $batches = PackagingBatch::whereIn('id', $batchIds)->lockForUpdate()->withSum('usages', 'qty')->get()->keyBy('id');
            $need = [];
            foreach ($data['usages'] as $u) {
                if (! $u['packaging_batch_id']) {
                    continue;
                }
                $b = $batches[$u['packaging_batch_id']];
                if ($b->packaging_material_id !== (int) $u['packaging_material_id']) {
                    abort(response()->json(['message' => "Partija {$b->batch_number} yra kitos medžiagos."], 422));
                }
                $need[$b->id] = ($need[$b->id] ?? 0) + (float) $u['qty'];
            }
            foreach ($need as $id => $qty) {
                $b = $batches[$id];
                $left = round((float) $b->qty_received - (float) $b->usages_sum_qty, 3);
                if ($qty > $left + 0.0005) {
                    abort(response()->json(['message' => "Partijos {$b->batch_number} likutis nepakankamas (liko {$left})."], 422));
                }
            }

            $qtyKg = round((float) $data['unit_weight_kg'] * (int) $data['qty_units'], 3);

            // perpakavimas - šaltinio vienetai išimami iš sandėlio (judėjimas „repack“)
            $source = null;
            if (! empty($data['source_packed_product_id'])) {
                $left = $this->stock->balance($data['source_packed_product_id'], $data['l_week_id'], $data['source_warehouse_id']);
                if ($left['qty_units'] < (int) $data['qty_units']) {
                    abort(response()->json(['message' => "Perpakuoti trūksta: šios L partijos sandėlyje yra tik {$left['qty_units']} vnt."], 422));
                }
                $srcKg = $left['qty_units'] > 0
                    ? min(round($left['qty_kg'] * (int) $data['qty_units'] / $left['qty_units'], 3), (float) $left['qty_kg'])
                    : 0;
                $target = PackedProduct::find($data['packed_product_id']);
                $source = ProductMovement::create([
                    'movement_date'     => $data['packing_date'],
                    'movement_type'     => 'repack',
                    'l_week_id'         => $data['l_week_id'],
                    'packed_product_id' => $data['source_packed_product_id'],
                    'qty_units'         => $data['qty_units'],
                    'qty_kg'            => $srcKg,
                    'warehouse_from_id' => $data['source_warehouse_id'],
                    'notes'             => "Perpakuota į {$target?->name}",
                    'created_by_id'     => $request->user()?->id,
                ]);
            }
            $movement = ProductMovement::create([
                'movement_date'     => $data['packing_date'],
                'movement_type'     => 'pack_in',
                'l_week_id'         => $data['l_week_id'],
                'packed_product_id' => $data['packed_product_id'],
                'qty_units'         => $data['qty_units'],
                'qty_kg'            => $qtyKg,
                'warehouse_to_id'   => $data['warehouse_id'],
                'notes'             => $source ? 'Perpakavimas' : 'Pakavimas',
                'created_by_id'     => $request->user()?->id,
            ]);

            $packing = Packing::create([
                'packing_date'        => $data['packing_date'],
                'l_week_id'           => $data['l_week_id'],
                'packed_product_id'   => $data['packed_product_id'],
                'unit_weight_kg'      => $data['unit_weight_kg'],
                'qty_units'           => $data['qty_units'],
                'qty_kg'              => $qtyKg,
                'warehouse_id'        => $data['warehouse_id'],
                'product_movement_id' => $movement->id,
                'source_movement_id'  => $source?->id,
                'shop_id'             => $data['shop_id'] ?? null,
                'boxes'               => $data['boxes'] ?? null,
                'source_packed_product_id' => $source ? $data['source_packed_product_id'] : null,
                'source_warehouse_id' => $source ? $data['source_warehouse_id'] : null,
                'notes'               => $data['notes'] ?? null,
                'created_by_id'       => $request->user()?->id,
            ]);
            foreach ($data['usages'] as $u) {
                $packing->usages()->create([
                    'packaging_material_id' => $u['packaging_material_id'],
                    'packaging_batch_id'    => $u['packaging_batch_id'] ?: null,
                    'qty'                   => $u['qty'],
                ]);
            }

            return $packing;
        });

        return response()->json(
            $this->withCost($packing->load(['lWeek', 'packedProduct.productionProduct', 'warehouse', 'shop', 'sourcePackedProduct', 'sourceWarehouse', 'usages.packagingMaterial', 'usages.packagingBatch'])),
            201
        );
    }

    public function lock(int $id)
    {
        return Packing::findOrFail($id)->toggleLock();
    }

    /** Trinant pakavimą grąžinamos medžiagos ir panaikinamas fasavimo papildymas. */
    public function destroy(int $id)
    {
        $packing = Packing::with(['movement', 'sourceMovement'])->findOrFail($id);
        if ($packing->is_locked) {
            return response()->json(['message' => 'Įrašas įspajamotas (užrakintas) – naikinti negalima.'], 423);
        }
        $m = $packing->movement;
        if ($m) {
            if ($m->is_locked) {
                return response()->json(['message' => 'Susijęs fasavimo judėjimas įspajamotas – pirma jį atrakinkite.'], 423);
            }
            $left = $this->stock->balance($m->packed_product_id, $m->l_week_id, $m->warehouse_to_id);
            if ($left['qty_units'] < $m->qty_units || round($left['qty_kg'] - (float) $m->qty_kg, 3) < 0) {
                return response()->json(['message' => 'Supakuotas produktas jau perkeltas/išvežtas – pirmiau trinkite vėlesnius judėjimus.'], 422);
            }
        }
        if ($packing->sourceMovement?->is_locked) {
            return response()->json(['message' => 'Susijęs perpakavimo judėjimas įspajamotas – pirma jį atrakinkite.'], 423);
        }
        DB::transaction(function () use ($packing, $m) {
            $src = $packing->sourceMovement;
            $packing->usages()->delete();
            $packing->delete();
            $m?->delete();
            $src?->delete(); // perpakuoti vienetai grįžta į šaltinio sandėlį
        });

        return response()->noContent();
    }
}
