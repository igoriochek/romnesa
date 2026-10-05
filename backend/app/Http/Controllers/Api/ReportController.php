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
use App\Services\MaterialStockService;
use App\Services\ProductStockService;

/**
 * Suvestinės (Excel "6 Partijų likučiai", "8 Suvestinė", "VIDINĖ SUVESTINĖ").
 */
class ReportController extends Controller
{
    public function __construct(
        private MaterialStockService $materialStock,
        private ProductStockService $productStock,
    ) {}

    /** Dashboard KPI. */
    public function dashboard()
    {
        $batches = MaterialBatch::with('rawMaterial')->get();

        $expiring = $batches->map(function ($b) {
                $b->balance_kg = $this->materialStock->batchBalance($b);
                $b->days_to_expiry = (int) now()->diffInDays($b->expiry_date, false);
                return $b;
            })
            ->filter(fn ($b) => $b->balance_kg > 0.001 && $b->days_to_expiry <= 14)
            ->sortBy('days_to_expiry')->values();

        $shortages = MaterialUsage::whereNull('material_batch_id')
            ->with(['rawMaterial', 'production.lWeek'])
            ->orderByDesc('id')->limit(20)->get();

        return [
            'produced_kg'      => (float) Production::sum('qty_produced_kg'),
            'productions'      => Production::count(),
            'batches_active'   => $batches->filter(fn ($b) => $this->materialStock->batchBalance($b) > 0.001)->count(),
            'expiring_soon'    => $expiring,
            'shortages'        => $shortages,
            'shipped_kg'       => (float) ProductMovement::where('movement_type', 'ship_out')->sum('qty_kg'),
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
                    'balance_kg'      => $this->materialStock->batchBalance($b),
                    'days_to_expiry'  => (int) now()->diffInDays($b->expiry_date, false),
                ];
            });
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
