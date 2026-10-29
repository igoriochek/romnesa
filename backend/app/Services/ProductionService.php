<?php

namespace App\Services;

use App\Models\MaterialUsage;
use App\Models\Production;
use App\Models\Recipe;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Gamybos registravimas: galiojanti receptūra -> žaliavų poreikis -> FIFO (arba rankinis) paskirstymas.
 * Naudoja ir API, ir Excel duomenų importas - kad sunaudojimas būtų skaičiuojamas vienodai.
 */
class ProductionService
{
    public function __construct(private MaterialStockService $stock) {}

    /** Galiojanti receptūros versija: L-partijai skirta > naujausia galiojanti versija. */
    public function resolveRecipe(int $productId, string $date, int $lWeekId): ?Recipe
    {
        return Recipe::with('items.rawMaterial')
            ->where('production_product_id', $productId)
            ->where('valid_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $date))
            // kitai L savaitei skirta versija netaikoma
            ->where(fn ($q) => $q->whereNull('applies_to_l_week_id')->orWhere('applies_to_l_week_id', $lWeekId))
            ->orderByRaw('CASE WHEN applies_to_l_week_id = ? THEN 0 ELSE 1 END', [$lWeekId])
            ->orderByDesc('version')
            ->first();
    }

    /**
     * Sukuria gamybą ir sunaudojimo eilutes (transakcijoje).
     *
     * @param  array{production_date: string, production_product_id: int, qty_produced_kg: float, l_week_id: int, notes?: string|null}  $data
     * @param  Collection  $manual  žaliava -> [{material_batch_id, qty_kg}] (vartotojo pakeistas planas); kitoms - FIFO
     */
    public function create(array $data, Recipe $recipe, Collection $manual, ?int $employeeId): Production
    {
        return DB::transaction(function () use ($data, $recipe, $manual, $employeeId) {
            $production = Production::create([
                ...$data,
                'recipe_id'   => $recipe->id,
                'employee_id' => $employeeId,
            ]);

            foreach ($recipe->items as $item) {
                $needed = round($item->qty_kg_per_kg * $production->qty_produced_kg, 3);
                if ($needed <= 0) {
                    continue;
                }
                $date = $production->production_date->toDateString();
                $allocations = match (true) {
                    ! $item->rawMaterial->requires_batch => [['batch_id' => null, 'qty_kg' => $needed]],
                    $manual->has($item->raw_material_id) => $this->stock->allocateManual(
                        $item->raw_material_id, $item->rawMaterial->name, $needed, $manual[$item->raw_material_id]->all(), $date
                    ),
                    default => $this->stock->allocateFifo($item->raw_material_id, $needed, $date),
                };

                foreach ($allocations as $a) {
                    MaterialUsage::create([
                        'production_id'     => $production->id,
                        'raw_material_id'   => $item->raw_material_id,
                        'material_batch_id' => $a['batch_id'],
                        'qty_kg'            => $a['qty_kg'],
                    ]);
                }
            }

            return $production;
        });
    }
}
