<?php

namespace App\Services;

use App\Models\MaterialBatch;
use App\Models\Production;
use App\Models\Recipe;

/**
 * Gaminio žaliavų savikaina.
 *
 * Faktinė savikaina = Σ sunaudota kg × TOS partijos €/kg (kaina saugoma kiekvienam gavimui atskirai).
 * Jei sunaudotai partijai kaina dar neįvesta arba žaliavos trūko (TRŪKSTA), ta dalis įvertinama
 * orientacine kaina - paskutinio iki gamybos dienos įkainoto tos žaliavos gavimo kaina
 * (jei tokio nėra - artimiausio vėlesnio). Žaliavos be partijos (vanduo) - 0 €.
 * Užregistruotas kaip „scoped" - kainų sąrašas užkraunamas vieną kartą per užklausą.
 */
class CostService
{
    /** @var array<int, list<array{date: string, price: float}>>|null */
    private ?array $prices = null;

    /** Įkainoti gavimai pagal žaliavą, seniausi pirmi. */
    private function prices(): array
    {
        return $this->prices ??= MaterialBatch::whereNotNull('unit_cost_eur')
            ->orderBy('received_date')->orderBy('id')
            ->get(['raw_material_id', 'received_date', 'unit_cost_eur'])
            ->groupBy('raw_material_id')
            ->map(fn ($bs) => $bs->map(fn ($b) => [
                'date'  => $b->received_date->toDateString(),
                'price' => (float) $b->unit_cost_eur,
            ])->all())
            ->all();
    }

    /** Orientacinė žaliavos €/kg dienai (null - šiai žaliavai kaina dar niekada neįvesta). */
    public function referencePrice(int $rawMaterialId, string $date): ?float
    {
        $before = null;
        foreach ($this->prices()[$rawMaterialId] ?? [] as $p) {
            if ($p['date'] > $date) {
                return $before ?? $p['price'];
            }
            $before = $p['price'];
        }

        return $before;
    }

    /**
     * Gamybos savikaina.
     *
     * @return array{
     *   cost_actual_eur: float, cost_estimated_eur: float, cost_eur: float|null, cost_per_kg_eur: float|null,
     *   cost_complete: bool, priced_share: float, cost_materials: list<array<string, mixed>>
     * }
     *   cost_eur - faktinė + įvertinta (null, jei kuriai nors žaliavai kainos nėra iš viso);
     *   cost_complete - visos sunaudotos partijos įkainotos ir nieko netrūko (savikaina be įverčių);
     *   priced_share - kokia dalis kg (kuriems reikia kainos) įkainota faktine partijos kaina.
     */
    public function production(Production $production): array
    {
        $production->loadMissing('usages.materialBatch', 'usages.rawMaterial');
        $date = $production->production_date->toDateString();

        $rows = [];
        $actual = $estimated = $pricedKg = $needPriceKg = 0.0;
        $complete = $computable = true;

        foreach ($production->usages as $u) {
            $kg = (float) $u->qty_kg;
            $row = $rows[$u->raw_material_id] ?? [
                'raw_material_id' => $u->raw_material_id,
                'raw_material'    => $u->rawMaterial?->name,
                'qty_kg'          => 0.0,
                'cost_eur'        => 0.0,
                'estimated_eur'   => 0.0,
                'missing_price'   => false,
            ];
            $row['qty_kg'] += $kg;

            if (! $u->materialBatch && $u->rawMaterial?->requires_batch === false) {
                $rows[$u->raw_material_id] = $row; // vanduo ir pan. - be kainos

                continue;
            }

            $needPriceKg += $kg;
            $unit = $u->materialBatch?->unit_cost_eur;
            if ($unit !== null) {
                $value = $kg * (float) $unit;
                $actual += $value;
                $row['cost_eur'] += $value;
                $pricedKg += $kg;
            } else {
                $complete = false;
                $ref = $this->referencePrice($u->raw_material_id, $date);
                if ($ref === null) {
                    $computable = false;
                    $row['missing_price'] = true;
                } else {
                    $value = $kg * $ref;
                    $estimated += $value;
                    $row['estimated_eur'] += $value;
                }
            }
            $rows[$u->raw_material_id] = $row;
        }

        $total = $computable ? $actual + $estimated : null;
        $qty = (float) $production->qty_produced_kg;

        $materials = array_values(array_map(function ($r) use ($total) {
            $sum = $r['cost_eur'] + $r['estimated_eur'];

            return [
                'raw_material_id' => $r['raw_material_id'],
                'raw_material'    => $r['raw_material'],
                'qty_kg'          => round($r['qty_kg'], 3),
                'cost_eur'        => $r['missing_price'] ? null : round($sum, 2),
                'unit_cost_eur'   => $r['missing_price'] || $r['qty_kg'] <= 0 ? null : round($sum / $r['qty_kg'], 4),
                'estimated'       => $r['estimated_eur'] > 0,
                'missing_price'   => $r['missing_price'],
                'share_pct'       => $total && ! $r['missing_price'] ? round($sum / $total * 100, 1) : null,
            ];
        }, $rows));

        return [
            'cost_actual_eur'    => round($actual, 2),
            'cost_estimated_eur' => round($estimated, 2),
            'cost_eur'           => $total === null ? null : round($total, 2),
            'cost_per_kg_eur'    => $total !== null && $qty > 0 ? round($total / $qty, 4) : null,
            'cost_complete'      => $complete,
            'priced_share'       => $needPriceKg > 0 ? round($pricedKg / $needPriceKg, 4) : 1.0,
            'cost_materials'     => $materials,
        ];
    }

    /**
     * Receptūrinė (normatyvinė) savikaina 1 kg produkto pagal orientacines kainas nurodytai dienai -
     * kiek turėtų kainuoti žaliavos, nepriklausomai nuo to, kurios partijos bus paimtos.
     */
    public function recipe(Recipe $recipe, string $date): array
    {
        $recipe->loadMissing('items.rawMaterial');
        $total = 0.0;
        $complete = true;

        $items = $recipe->items->map(function ($item) use ($date, &$total, &$complete) {
            $free = $item->rawMaterial?->requires_batch === false;
            $price = $free ? 0.0 : $this->referencePrice($item->raw_material_id, $date);
            $value = $price === null ? null : (float) $item->qty_kg_per_kg * $price;
            if ($value === null) {
                $complete = false;
            } else {
                $total += $value;
            }

            return [
                'raw_material_id' => $item->raw_material_id,
                'raw_material'    => $item->rawMaterial?->name,
                'qty_kg_per_kg'   => (float) $item->qty_kg_per_kg,
                'unit_cost_eur'   => $price,
                'cost_per_kg_eur' => $value === null ? null : round($value, 4),
            ];
        })->values();

        return [
            'date'            => $date,
            'items'           => $items,
            'cost_per_kg_eur' => round($total, 4),
            'complete'        => $complete,
        ];
    }
}
