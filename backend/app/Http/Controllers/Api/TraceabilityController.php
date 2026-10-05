<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LWeek;
use App\Models\MaterialBatch;
use App\Models\MaterialUsage;
use App\Models\ProductMovement;
use App\Services\MaterialStockService;

/**
 * ATSEKAMUMO PAIEŠKA (Excel "7") - dvipusis atsekamumas:
 *  - partija -> kur panaudota (gamyba -> L savaitė -> parduotuvės)
 *  - L savaitė -> kokios žaliavų partijos panaudotos
 */
class TraceabilityController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    /** Partija -> panaudojimai gamyboje -> L savaitės -> išvežimai. */
    public function batch(int $batchId)
    {
        $batch = MaterialBatch::with('rawMaterial')->findOrFail($batchId);

        $usages = MaterialUsage::with(['production.productionProduct', 'production.lWeek'])
            ->where('material_batch_id', $batchId)->get();

        $lWeekIds = $usages->pluck('production.l_week_id')->filter()->unique()->values();

        $shipments = ProductMovement::with(['shop', 'warehouseTo', 'packedProduct'])
            ->whereIn('l_week_id', $lWeekIds)
            ->orderBy('movement_date')->get();

        return [
            'batch'      => array_merge($batch->toArray(), ['balance_kg' => $this->stock->batchBalance($batch)]),
            'usages'     => $usages,
            'movements'  => $shipments,
        ];
    }

    /** L savaitė -> gamybos -> žaliavų partijos -> išvežimai. */
    public function lWeek(string $code)
    {
        $lweek = LWeek::whereRaw('upper(code) = ?', [strtoupper($code)])->firstOrFail();

        $usages = MaterialUsage::with([
                'materialBatch.rawMaterial', 'materialBatch',
                'production.productionProduct', 'rawMaterial',
            ])
            ->whereHas('production', fn ($q) => $q->where('l_week_id', $lweek->id))
            ->get();

        $movements = ProductMovement::with(['packedProduct', 'warehouseFrom', 'warehouseTo', 'shop'])
            ->where('l_week_id', $lweek->id)
            ->orderBy('movement_date')->get();

        return [
            'l_week'    => $lweek,
            'materials' => $usages,
            'movements' => $movements,
        ];
    }
}
