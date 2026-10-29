<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LWeek;
use App\Models\MaterialBatch;
use App\Models\MaterialUsage;
use App\Models\PackedProduct;
use App\Models\Production;
use App\Models\ProductMovement;
use App\Models\Warehouse;
use App\Services\CostService;
use App\Services\MaterialStockService;
use App\Services\ProductStockService;
use Illuminate\Http\Request;

/**
 * Suvestinės (Excel "6 Partijų likučiai", "8 Suvestinė", "VIDINĖ SUVESTINĖ").
 */
class ReportController extends Controller
{
    public function __construct(
        private MaterialStockService $materialStock,
        private ProductStockService $productStock,
        private CostService $cost,
    ) {}

    /** Dashboard KPI. */
    public function dashboard()
    {
        $batches = MaterialStockService::withSums(MaterialBatch::with('rawMaterial'))->get()
            ->each(fn ($b) => $this->materialStock->withTotals($b));
        $active = $batches->filter(fn ($b) => $b->balance_kg > 0.001);

        $expiring = $active
            ->filter(fn ($b) => $b->days_to_expiry <= 14)
            ->sortBy('days_to_expiry')->values();

        // Trūkumas - tik žaliavoms, kurioms partija privaloma (vanduo ir pan. - išimtys)
        $shortages = MaterialUsage::whereNull('material_batch_id')
            ->whereHas('rawMaterial', fn ($q) => $q->where('requires_batch', true))
            ->with(['rawMaterial', 'production.lWeek'])
            ->orderByDesc('id')->limit(20)->get();

        // Pagrindinių žaliavų gauta / sunaudota / perduota / likutis (aprašo „8 Suvestinė")
        $materials = $batches->groupBy('raw_material_id')->map(fn ($bs) => [
            'id'           => $bs->first()->raw_material_id,
            'raw_material' => $bs->first()->rawMaterial?->name,
            'received_kg'  => round($bs->sum(fn ($b) => (float) $b->qty_received_kg), 3),
            'used_kg'      => round($bs->sum('used_kg'), 3),
            'outflow_kg'   => round($bs->sum('outflow_kg'), 3),
            'balance_kg'   => round($bs->sum('balance_kg'), 3),
            'expired_kg'   => round($bs->filter(fn ($b) => $b->days_to_expiry < 0)->sum('balance_kg'), 3),
            // Likučio vertė - tik partijų su nurodyta savikaina; value_complete=false, jei likutyje yra be kainos
            'balance_value_eur' => round($bs->sum(fn ($b) => (float) $b->balance_value_eur), 2),
            'value_complete'    => $bs->every(fn ($b) => $b->unit_cost_eur !== null || $b->balance_kg <= 0.001),
        ])->sortBy('raw_material')->values();

        return [
            'produced_kg'      => (float) Production::sum('qty_produced_kg'),
            'productions'      => Production::count(),
            'batches_active'   => $active->count(),
            'batches_expired'  => $active->filter(fn ($b) => $b->days_to_expiry < 0)->count(),
            'expiring_soon'    => $expiring,
            'shortages'        => $shortages,
            'materials'        => $materials,
            'stock_value_eur'  => round($materials->sum('balance_value_eur'), 2),
            'shipped_kg'       => (float) ProductMovement::where('movement_type', 'ship_out')->sum('qty_kg'),
            'updated_at'       => now()->toIso8601String(),
        ];
    }

    /** Partijų likučiai (vienas reportas). */
    public function batchBalances()
    {
        return MaterialBatch::with('rawMaterial')->orderBy('expiry_date')->get()
            ->map(function ($b) {
                return [
                    'id'              => $b->id,
                    'batch_number'    => $b->batch_number,
                    'raw_material'    => $b->rawMaterial?->name,
                    'received_date'   => $b->received_date,
                    'expiry_date'     => $b->expiry_date,
                    'qty_received_kg' => (float) $b->qty_received_kg,
                    'unit_cost_eur'   => $b->unit_cost_eur === null ? null : (float) $b->unit_cost_eur,
                    'balance_kg'      => $this->materialStock->batchBalance($b),
                    'days_to_expiry'  => $b->daysToExpiry(),
                ];
            });
    }

    /**
     * Partijų / likučių ataskaita spausdinimui: visos partijos (be puslapiavimo) su sumomis ir vertėmis.
     * Filtrai: from/to (gavimo data), raw_material_id, only_balance=1 (tik su likučiu).
     */
    public function batches(Request $request)
    {
        $f = $request->validate([
            'from'            => 'nullable|date',
            'to'              => 'nullable|date',
            'raw_material_id' => 'nullable|integer',
            'only_balance'    => 'nullable|boolean',
        ]);

        return MaterialStockService::withSums(MaterialBatch::with(['rawMaterial', 'warehouse']))
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('received_date', '>=', $d))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('received_date', '<=', $d))
            ->when($f['raw_material_id'] ?? null, fn ($q, $id) => $q->where('raw_material_id', $id))
            ->orderBy('raw_material_id')->orderBy('received_date')->orderBy('id')
            ->get()
            ->each(fn ($b) => $this->materialStock->withTotals($b))
            ->when($request->boolean('only_balance'), fn ($c) => $c->filter(fn ($b) => $b->balance_kg > 0.001))
            ->values();
    }

    /**
     * Sunaudojimo ataskaita: kiekviena sunaudojimo eilutė (gamybos data, Nr., gaminys, L savaitė,
     * žaliava, partija, kg, €/kg, vertė). Filtrai: from/to (gamybos data), raw_material_id.
     */
    public function usage(Request $request)
    {
        $f = $request->validate([
            'from'            => 'nullable|date',
            'to'              => 'nullable|date',
            'raw_material_id' => 'nullable|integer',
        ]);

        return MaterialUsage::with(['rawMaterial', 'materialBatch', 'production.productionProduct', 'production.lWeek'])
            ->whereHas('production', fn ($q) => $q
                ->when($f['from'] ?? null, fn ($q, $d) => $q->where('production_date', '>=', $d))
                ->when($f['to'] ?? null, fn ($q, $d) => $q->where('production_date', '<=', $d)))
            ->when($f['raw_material_id'] ?? null, fn ($q, $id) => $q->where('raw_material_id', $id))
            ->get()
            ->map(function ($u) {
                $unit = $u->materialBatch?->unit_cost_eur;
                $u->unit_cost_eur = $unit === null ? null : (float) $unit;
                $u->value_eur = $unit === null ? null : round((float) $u->qty_kg * (float) $unit, 2);

                return $u;
            })
            ->sortBy([
                fn ($a, $b) => $a->production->production_date <=> $b->production->production_date,
                fn ($a, $b) => $a->production_id <=> $b->production_id,
            ])
            ->values();
    }

    /**
     * Gaminių žaliavų savikainos ataskaita: kiekviena gamyba, suvestinės pagal gaminį, L savaitę ir žaliavą.
     * Filtrai: from/to (gamybos data), production_product_id.
     * Grupės savikaina null, jei bent vienai jos gamybai savikainos apskaičiuoti negalima (žaliavai kaina neįvesta niekada).
     */
    public function cost(Request $request)
    {
        $f = $request->validate([
            'from'                  => 'nullable|date',
            'to'                    => 'nullable|date',
            'production_product_id' => 'nullable|integer',
        ]);

        $productions = Production::with(['productionProduct', 'lWeek', 'usages.materialBatch', 'usages.rawMaterial'])
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('production_date', '>=', $d))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('production_date', '<=', $d))
            ->when($f['production_product_id'] ?? null, fn ($q, $id) => $q->where('production_product_id', $id))
            ->orderBy('production_date')->orderBy('id')
            ->get()
            ->map(fn ($p) => ['p' => $p, 'c' => $this->cost->production($p)]);

        $summary = function ($group) {
            $kg = $group->sum(fn ($r) => (float) $r['p']->qty_produced_kg);
            $computable = $group->every(fn ($r) => $r['c']['cost_eur'] !== null);
            $eur = $computable ? $group->sum(fn ($r) => $r['c']['cost_eur']) : null;

            return [
                'productions'        => $group->count(),
                'qty_produced_kg'    => round($kg, 3),
                'cost_eur'           => $eur === null ? null : round($eur, 2),
                'cost_estimated_eur' => round($group->sum(fn ($r) => $r['c']['cost_estimated_eur']), 2),
                'cost_per_kg_eur'    => $eur !== null && $kg > 0 ? round($eur / $kg, 4) : null,
                'cost_complete'      => $group->every(fn ($r) => $r['c']['cost_complete']),
            ];
        };

        $byMaterial = $productions->flatMap(fn ($r) => $r['c']['cost_materials'])
            ->groupBy('raw_material_id')
            ->map(function ($rows) {
                $missing = $rows->contains('missing_price', true);

                return [
                    'raw_material'  => $rows->first()['raw_material'],
                    'qty_kg'        => round($rows->sum('qty_kg'), 3),
                    'cost_eur'      => $missing ? null : round($rows->sum('cost_eur'), 2),
                    'estimated'     => $rows->contains('estimated', true),
                    'missing_price' => $missing,
                ];
            })->sortBy('raw_material')->values();
        $materialsTotal = $byMaterial->sum(fn ($m) => (float) $m['cost_eur']);
        $byMaterial = $byMaterial->map(fn ($m) => [
            ...$m,
            'unit_cost_eur' => $m['cost_eur'] !== null && $m['qty_kg'] > 0 ? round($m['cost_eur'] / $m['qty_kg'], 4) : null,
            'share_pct'     => $m['cost_eur'] !== null && $materialsTotal > 0 ? round($m['cost_eur'] / $materialsTotal * 100, 1) : null,
        ]);

        return [
            'productions' => $productions->map(fn ($r) => [
                'id'              => $r['p']->id,
                'production_date' => $r['p']->production_date->toDateString(),
                'product'         => $r['p']->productionProduct?->name,
                'l_week'          => $r['p']->lWeek?->code,
                'qty_produced_kg' => (float) $r['p']->qty_produced_kg,
                ...collect($r['c'])->except('cost_materials')->all(),
            ])->values(),
            'by_product' => $productions->groupBy(fn ($r) => $r['p']->productionProduct?->name)
                ->map(fn ($g, $name) => ['product' => $name, ...$summary($g)])->sortKeys()->values(),
            'by_l_week' => $productions->groupBy(fn ($r) => $r['p']->lWeek?->code.'|'.$r['p']->productionProduct?->name)
                ->map(fn ($g) => [
                    'l_week'  => $g->first()['p']->lWeek?->code,
                    'product' => $g->first()['p']->productionProduct?->name,
                    ...$summary($g),
                ])->values(),
            'by_material' => $byMaterial,
            'totals'      => $summary($productions),
            // gamyboje panaudotos partijos, kurioms kaina dar neįvesta (jų dalis savikainoje - įvertinta)
            'unpriced_batches' => MaterialBatch::whereNull('unit_cost_eur')->whereHas('usages')->count(),
        ];
    }

    /** Produkto likučiai pagal sandėlį (vidinė suvestinė). */
    public function warehouseStock()
    {
        $warehouses = Warehouse::pluck('name', 'id');
        $products   = PackedProduct::pluck('name', 'id');
        $lweeks     = LWeek::pluck('code', 'id');

        $rows = [];
        foreach ($this->productStock->balances() as $key => $b) {
            if ($b['units'] == 0 && abs($b['kg']) < 0.001) {
                continue;
            }
            [$ppId, $lwId, $whId] = array_map('intval', explode('|', $key));
            $rows[] = [
                'packed_product' => $products[$ppId] ?? "#$ppId",
                'l_week'         => $lweeks[$lwId] ?? "#$lwId",
                'warehouse'      => $warehouses[$whId] ?? "#$whId",
                'qty_units'      => $b['units'],
                'qty_kg'         => $b['kg'],
            ];
        }

        usort($rows, fn ($a, $c) => [$a['warehouse'], $a['packed_product']] <=> [$c['warehouse'], $c['packed_product']]);

        return $rows;
    }

    /** Išvežimai į parduotuves suvestinė. */
    public function shipments()
    {
        return ProductMovement::with(['packedProduct', 'warehouseFrom', 'shop', 'lWeek'])
            ->where('movement_type', 'ship_out')
            ->orderByDesc('movement_date')->orderByDesc('id')
            ->get()
            ->groupBy(fn ($m) => $m->shop?->name ?? '-')
            ->map(fn ($ms, $shop) => [
                'shop'      => $shop,
                'qty_units' => $ms->sum('qty_units'),
                'qty_kg'    => round((float) $ms->sum('qty_kg'), 3),
                'shipments' => $ms->count(),
            ])->values();
    }
}
