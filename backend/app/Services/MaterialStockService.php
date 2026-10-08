<?php

namespace App\Services;

use App\Models\MaterialBatch;
use App\Models\MaterialUsage;
use App\Models\MaterialOutflow;

/**
 * Žaliavų partijų likučiai ir FIFO paskirstymas su galiojimo kontrole.
 * Likutis = gauta - sunaudota gamyboje - išrašyta/perduota.
 */
class MaterialStockService
{
    /** Partijos likutis kg. */
    public function batchBalance(MaterialBatch $batch): float
    {
        return $this->batchTotals($batch)['balance_kg'];
    }

    /**
     * Partijos istorijos sumos („6 Partijų likučiai"): gauta, sunaudota, perduota, likutis.
     *
     * @return array{used_kg: float, outflow_kg: float, balance_kg: float}
     */
    public function batchTotals(MaterialBatch $batch): array
    {
        $used = (float) MaterialUsage::where('material_batch_id', $batch->id)->sum('qty_kg');
        $out  = (float) MaterialOutflow::where('material_batch_id', $batch->id)->sum('qty_kg');

        return [
            'used_kg'    => round($used, 3),
            'outflow_kg' => round($out, 3),
            'balance_kg' => round((float) $batch->qty_received_kg - $used - $out, 3),
        ];
    }

    /** Partijai priskiria likučio laukus (balance_kg, used_kg, outflow_kg, days_to_expiry). */
    public function withTotals(MaterialBatch $batch): MaterialBatch
    {
        foreach ($this->batchTotals($batch) as $key => $value) {
            $batch->{$key} = $value;
        }
        $batch->days_to_expiry = $batch->daysToExpiry();

        return $batch;
    }

    /**
     * FIFO paskirstymas į material_usages eilutes.
     *
     * @return array<int, array{batch_id: int|null, qty_kg: float}>
     *         batch_id=null -> trūksta (TRŪKSTA statusas)
     */
    public function allocateFifo(int $rawMaterialId, float $qtyKg, ?string $productionDate = null): array
    {
        return array_map(
            fn ($a) => ['batch_id' => $a['batch']?->id, 'qty_kg' => $a['qty_kg']],
            $this->plan($rawMaterialId, $qtyKg, $productionDate)
        );
    }

    /**
     * FIFO planas su partijos detalėmis („iš kokios partijos nurašoma").
     * Pagal aprašą partija tinkama, kai: gauta ne vėliau už gamybos datą,
     * galiojimas gamybos dieną nepasibaigęs, yra likutis. Imama seniausiai gauta;
     * naujesnė - tik kai senesnė išnaudota ar nebegalioja.
     *
     * @return array<int, array{batch: MaterialBatch|null, qty_kg: float, available_kg: float}>
     */
    public function plan(int $rawMaterialId, float $qtyKg, ?string $productionDate = null): array
    {
        $batches = MaterialBatch::where('raw_material_id', $rawMaterialId)
            ->when($productionDate, fn ($q) => $q
                ->where('received_date', '<=', $productionDate)
                ->where('expiry_date', '>=', $productionDate))
            ->orderBy('received_date')
            ->orderBy('expiry_date')
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
            $allocations[] = [
                'batch'        => $batch,
                'qty_kg'       => round($take, 3),
                'available_kg' => round($available, 3),
            ];
            $remaining = round($remaining - $take, 3);
        }

        if ($remaining > 0) {
            $allocations[] = ['batch' => null, 'qty_kg' => $remaining, 'available_kg' => 0.0];
        }

        return $allocations;
    }
}
