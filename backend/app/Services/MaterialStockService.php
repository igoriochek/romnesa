<?php

namespace App\Services;

use App\Models\MaterialBatch;
use App\Models\MaterialUsage;
use App\Models\MaterialOutflow;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

/**
 * Žaliavų partijų likučiai ir FIFO paskirstymas su galiojimo kontrole.
 * Likutis = gauta - sunaudota gamyboje - išrašyta/perduota.
 */
class MaterialStockService
{
    /**
     * Prideda sunaudoto / perduoto kiekio sumas viena užklausa (be N+1) -
     * batchTotals() jas paima, jei jos jau užkrautos.
     */
    public static function withSums(Builder $query): Builder
    {
        return $query->withSum('usages', 'qty_kg')->withSum('outflows', 'qty_kg');
    }

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
        $attrs = $batch->getAttributes();
        $used = array_key_exists('usages_sum_qty_kg', $attrs)
            ? (float) $attrs['usages_sum_qty_kg']
            : (float) MaterialUsage::where('material_batch_id', $batch->id)->sum('qty_kg');
        $out = array_key_exists('outflows_sum_qty_kg', $attrs)
            ? (float) $attrs['outflows_sum_qty_kg']
            : (float) MaterialOutflow::where('material_batch_id', $batch->id)->sum('qty_kg');

        return [
            'used_kg'    => round($used, 3),
            'outflow_kg' => round($out, 3),
            'balance_kg' => round((float) $batch->qty_received_kg - $used - $out, 3),
        ];
    }

    /**
     * Partijai priskiria likučio laukus (balance_kg, used_kg, outflow_kg, days_to_expiry)
     * ir vertes pagal savikainą (total_cost_eur, balance_value_eur; null - savikaina nenurodyta).
     */
    public function withTotals(MaterialBatch $batch): MaterialBatch
    {
        foreach ($this->batchTotals($batch) as $key => $value) {
            $batch->{$key} = $value;
        }
        $batch->days_to_expiry = $batch->daysToExpiry();

        $unit = $batch->unit_cost_eur;
        $batch->total_cost_eur    = $unit === null ? null : round((float) $batch->qty_received_kg * (float) $unit, 2);
        $batch->balance_value_eur = $unit === null ? null : round($batch->balance_kg * (float) $unit, 2);
        // pagalbinės sumų kolonos atsakyme nereikalingos
        $batch->makeHidden(['usages_sum_qty_kg', 'outflows_sum_qty_kg']);

        return $batch;
    }

    /**
     * FIFO paskirstymas į material_usages eilutes. Kviečiamas transakcijoje - partijos užrakinamos
     * (lockForUpdate), kad dvi vienu metu registruojamos gamybos nepaimtų to paties likučio.
     *
     * @return array<int, array{batch_id: int|null, qty_kg: float}>
     *         batch_id=null -> trūksta (TRŪKSTA statusas)
     */
    public function allocateFifo(int $rawMaterialId, float $qtyKg, ?string $productionDate = null): array
    {
        return array_map(
            fn ($a) => ['batch_id' => $a['batch']?->id, 'qty_kg' => $a['qty_kg']],
            $this->plan($rawMaterialId, $qtyKg, $productionDate, lock: true)
        );
    }

    /** Partijos, iš kurių galima imti gamybai nurodytą dieną (gauta iki tos dienos, dar galioja), seniausios pirmos. */
    public function eligibleBatches(int $rawMaterialId, ?string $productionDate, bool $lock = false)
    {
        return MaterialBatch::where('raw_material_id', $rawMaterialId)
            ->when($productionDate, fn ($q) => $q
                ->where('received_date', '<=', $productionDate)
                ->where('expiry_date', '>=', $productionDate))
            ->orderBy('received_date')
            ->orderBy('expiry_date')
            ->orderBy('id')
            ->when($lock, fn ($q) => $q->lockForUpdate())
            ->get();
    }

    /**
     * FIFO planas su partijos detalėmis („iš kokios partijos nurašoma").
     * Pagal aprašą partija tinkama, kai: gauta ne vėliau už gamybos datą,
     * galiojimas gamybos dieną nepasibaigęs, yra likutis. Imama seniausiai gauta;
     * naujesnė - tik kai senesnė išnaudota ar nebegalioja.
     *
     * @return array<int, array{batch: MaterialBatch|null, qty_kg: float, available_kg: float}>
     */
    public function plan(int $rawMaterialId, float $qtyKg, ?string $productionDate = null, bool $lock = false): array
    {
        $allocations = [];
        $remaining = round($qtyKg, 3);

        foreach ($this->eligibleBatches($rawMaterialId, $productionDate, $lock) as $batch) {
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

    /**
     * Rankiniu būdu (vartotojo pakeistame plane) parinktos partijos: tikrinama, kad partija
     * tinkama tai dienai, priklauso žaliavai ir jos likutis pakankamas. Bendras kiekis negali viršyti poreikio;
     * kas lieka nepaskirstyta - TRŪKSTA eilutė (kaip ir FIFO).
     *
     * @param  array<int, array{material_batch_id: int, qty_kg: float}>  $picked
     * @return array<int, array{batch_id: int|null, qty_kg: float}>
     */
    public function allocateManual(int $rawMaterialId, string $materialName, float $neededKg, array $picked, string $productionDate): array
    {
        $eligible = $this->eligibleBatches($rawMaterialId, $productionDate, lock: true)->keyBy('id');
        $allocations = [];
        $total = 0.0;
        $taken = [];

        foreach ($picked as $p) {
            $qty = round((float) $p['qty_kg'], 3);
            if ($qty <= 0) {
                continue;
            }
            $batch = $eligible->get((int) $p['material_batch_id']);
            if (! $batch) {
                throw ValidationException::withMessages([
                    'allocations' => "{$materialName}: pasirinkta partija netinka (kita žaliava, dar negauta arba nebegalioja gamybos dieną).",
                ]);
            }
            $taken[$batch->id] = round(($taken[$batch->id] ?? 0) + $qty, 3);
            $available = $this->batchBalance($batch);
            if ($taken[$batch->id] > $available + 0.0005) {
                throw ValidationException::withMessages([
                    'allocations' => "{$materialName}: partijos {$batch->batch_number} likutis tik {$available} kg.",
                ]);
            }
            $allocations[] = ['batch_id' => $batch->id, 'qty_kg' => $qty];
            $total = round($total + $qty, 3);
        }

        if ($total > round($neededKg, 3) + 0.0005) {
            throw ValidationException::withMessages([
                'allocations' => "{$materialName}: paskirstyta {$total} kg, o pagal receptūrą reikia {$neededKg} kg.",
            ]);
        }

        $remaining = round($neededKg - $total, 3);
        if ($remaining > 0) {
            $allocations[] = ['batch_id' => null, 'qty_kg' => $remaining];
        }

        return $allocations;
    }
}
