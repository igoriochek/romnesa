<?php

namespace App\Services;

use App\Models\ProductMovement;

/**
 * Pagamintos produkcijos likučiai sandėliuose.
 * Likutis = pack_in + move(į sandėlį) - move(iš sandėlio) - ship_out(iš sandėlio).
 */
class ProductStockService
{
    /** Likučiai pagal (packed_product_id, l_week_id, warehouse_id). */
    public function balances(): array
    {
        $rows = ProductMovement::select([
                'packed_product_id', 'l_week_id',
                'warehouse_from_id', 'warehouse_to_id', 'qty_units', 'qty_kg',
            ])->get();

        $balances = [];

        foreach ($rows as $m) {
            if ($m->warehouse_to_id) {
                $k = $m->packed_product_id . '|' . $m->l_week_id . '|' . $m->warehouse_to_id;
                $balances[$k]['units'] = ($balances[$k]['units'] ?? 0) + $m->qty_units;
                $balances[$k]['kg']    = round(($balances[$k]['kg'] ?? 0) + (float) $m->qty_kg, 3);
            }
            if ($m->warehouse_from_id) {
                $k = $m->packed_product_id . '|' . $m->l_week_id . '|' . $m->warehouse_from_id;
                $balances[$k]['units'] = ($balances[$k]['units'] ?? 0) - $m->qty_units;
                $balances[$k]['kg']    = round(($balances[$k]['kg'] ?? 0) - (float) $m->qty_kg, 3);
            }
        }

        return $balances;
    }

    /** Konkretaus produkto/l-savaitės likutis sandėlyje. */
    public function balance(int $packedProductId, int $lWeekId, int $warehouseId): array
    {
        $b = $this->balances()["$packedProductId|$lWeekId|$warehouseId"] ?? ['units' => 0, 'kg' => 0.0];
        return ['qty_units' => $b['units'], 'qty_kg' => $b['kg']];
    }
}
