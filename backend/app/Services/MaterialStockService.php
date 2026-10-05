<?php

namespace App\Services;

use App\Models\MaterialBatch;
use App\Models\MaterialUsage;
use App\Models\MaterialOutflow;

/**
 * Žaliavų partijų likučiai ir FIFO (FEFO) paskirstymas.
 * Likutis = gauta - sunaudota gamyboje - išrašyta/perduota.
 */
class MaterialStockService
{
    /** Partijos likutis kg. */
    public function batchBalance(MaterialBatch $batch): float
    {
        $used = MaterialUsage::where('material_batch_id', $batch->id)->sum('qty_kg');
        $out  = MaterialOutflow::where('material_batch_id', $batch->id)->sum('qty_kg');

        return round((float) $batch->qty_received_kg - (float) $used - (float) $out, 3);
    }

    /**
     * FIFO/FEFO paskirstymas: pirmiausia partijos su anksčiausia galiojimo data,
     * tada - seniausia gavimo data. Pasibaigusias partijas praleidžiame.
     *
     * @return array<int, array{batch_id: int|null, qty_kg: float}>
     *         batch_id=null -> trūksta (TRŪKSTA statusas)
     */
    public function allocateFifo(int $rawMaterialId, float $qtyKg, ?string $notExpiredAfter = null): array
    {
        $batches = MaterialBatch::where('raw_material_id', $rawMaterialId)
            ->when($notExpiredAfter, fn ($q) => $q->where('expiry_date', '>=', $notExpiredAfter))
            ->orderBy('expiry_date')
            ->orderBy('received_date')
            ->orderBy('id')
            ->get();

        $allocations = [];
        $remaining = round($qtyKg, 3);

        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }
            $available = $this->batchBalance($batch);
            if ($available <= 0) {
                continue;
            }
            $take = min($available, $remaining);
            $allocations[] = ['batch_id' => $batch->id, 'qty_kg' => round($take, 3)];
            $remaining = round($remaining - $take, 3);
        }

        if ($remaining > 0) {
            $allocations[] = ['batch_id' => null, 'qty_kg' => $remaining];
        }

        return $allocations;
    }
}
