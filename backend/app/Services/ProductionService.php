<?php

namespace App\Services;

use App\Models\MaterialUsage;
use App\Models\Production;
use App\Models\Recipe;
use App\Models\RecipeAdjustment;
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
     * Gamybai taikomos normos: pagrindinė receptūra + tos dienos mėnesio korekcijos.
     * Korekcija pakeičia žaliavos normą (arba prideda žaliavą, kurios receptūroje nėra);
     * pati receptūra nekeičiama, kitų laikotarpių gamybos nepaliečiamos.
     */
    public function effectiveItems(Recipe $recipe, string $date): Collection
    {
        $adjustments = RecipeAdjustment::with('rawMaterial')
            ->where('production_product_id', $recipe->production_product_id)
            ->where('valid_from', '<=', $date)->where('valid_to', '>=', $date)
            ->get()->keyBy('raw_material_id');

        $items = $recipe->items->map(function ($item) use ($adjustments) {
            $adj = $adjustments->get($item->raw_material_id);

            return (object) [
                'raw_material_id'    => $item->raw_material_id,
                'rawMaterial'        => $item->rawMaterial,
                'qty_kg_per_kg'      => $adj ? (float) $adj->qty_kg_per_kg : (float) $item->qty_kg_per_kg,
                'base_qty_kg_per_kg' => (float) $item->qty_kg_per_kg,
                'adjustment_id'      => $adj?->id,
            ];
        })->toBase();
        foreach ($adjustments as $adj) {
            if (! $recipe->items->contains('raw_material_id', $adj->raw_material_id)) {
                $items->push((object) [
                    'raw_material_id'    => $adj->raw_material_id,
                    'rawMaterial'        => $adj->rawMaterial,
                    'qty_kg_per_kg'      => (float) $adj->qty_kg_per_kg,
                    'base_qty_kg_per_kg' => null,
                    'adjustment_id'      => $adj->id,
                ]);
            }
        }

        return $items->values();
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

            $date = $production->production_date->toDateString();
            foreach ($this->effectiveItems($recipe, $date) as $item) {
                $needed = round($item->qty_kg_per_kg * $production->qty_produced_kg, 3);
                if ($needed <= 0) {
                    continue;
                }
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

    /** Sunaudojimo eilutė; jei tokia (gamyba, žaliava, partija) jau yra - kiekis pridedamas. */
    private function addUsage(int $productionId, int $rawMaterialId, ?int $batchId, float $qty): void
    {
        if ($qty <= 0) {
            return;
        }
        $row = MaterialUsage::where('production_id', $productionId)->where('raw_material_id', $rawMaterialId)
            ->where(fn ($q) => $batchId ? $q->where('material_batch_id', $batchId) : $q->whereNull('material_batch_id'))
            ->first();
        if ($row) {
            $row->update(['qty_kg' => round((float) $row->qty_kg + $qty, 3)]);
        } else {
            MaterialUsage::create([
                'production_id' => $productionId, 'raw_material_id' => $rawMaterialId,
                'material_batch_id' => $batchId, 'qty_kg' => round($qty, 3),
            ]);
        }
    }

    /** Trūkumai (TRŪKSTA, kg) pagal žaliavą nurodytoms gamyboms. */
    private function shortages(Collection $productionIds): array
    {
        return MaterialUsage::whereIn('production_id', $productionIds)->whereNull('material_batch_id')
            ->whereHas('rawMaterial', fn ($q) => $q->where('requires_batch', true))
            ->with('rawMaterial')->get()
            ->groupBy(fn ($u) => $u->rawMaterial->name)
            ->map(fn ($g) => round($g->sum(fn ($u) => (float) $u->qty_kg), 3))
            ->sortKeys()->all();
    }

    /**
     * Panaudotos partijos pašalinimas (pvz. klaidingai įvesta): jos sunaudojimai paskirstomi FIFO
     * kitoms tą dieną tinkamoms partijoms; ko neužtenka - TRŪKSTA. Įspajamotų gamybų neliečia.
     */
    public function deleteBatchWithReallocation(\App\Models\MaterialBatch $batch): array
    {
        return DB::transaction(function () use ($batch) {
            $usages = MaterialUsage::with('production')->where('material_batch_id', $batch->id)->get();
            $locked = $usages->filter(fn ($u) => $u->production?->is_locked)->map(fn ($u) => '#'.$u->production_id)->unique();
            if ($locked->isNotEmpty()) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'batch' => 'Partija panaudota įspajamotose gamybose ('.$locked->implode(', ').') – pirma jas atrakinkite.',
                ]);
            }
            if ($batch->outflows()->exists()) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'batch' => 'Iš partijos yra perdavimų / nurašymų – pirma ištrinkite juos skiltyje „Perdavimai“.',
                ]);
            }

            $usages->each->delete();
            $batch->delete();

            foreach ($usages->sortBy(fn ($u) => $u->production->production_date->toDateString().sprintf('%010d', $u->production_id)) as $u) {
                $date = $u->production->production_date->toDateString();
                foreach ($this->stock->allocateFifo($u->raw_material_id, (float) $u->qty_kg, $date) as $a) {
                    $this->addUsage($u->production_id, $u->raw_material_id, $a['batch_id'], $a['qty_kg']);
                }
            }
            $ids = $usages->pluck('production_id')->unique()->values();

            return [
                'productions'  => $ids->count(),
                'moved_kg'     => round($usages->sum(fn ($u) => (float) $u->qty_kg), 3),
                'shortages'    => $this->shortages($ids),
            ];
        });
    }

    /**
     * Sunaudojimo perskaičiavimas (neįspajamotoms gamyboms, nuo seniausios):
     *  - mode=shortages: tik TRŪKSTA eilutės bandomos padengti FIFO iš partijų (pvz. vėliau įvedus gavimą);
     *  - mode=full: visas sunaudojimas sukuriamas iš naujo pagal tą dieną galiojančią receptūrą (pvz. pataisius receptūrą).
     * dry_run - tik parodo rezultatą (pakeitimai atšaukiami).
     *
     * @param  array{from?: string|null, to?: string|null, production_product_id?: int|null, raw_material_id?: int|null}  $f
     */
    public function recalculate(array $f, string $mode, bool $dryRun): array
    {
        $productions = Production::where('is_locked', false)
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('production_date', '>=', $d))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('production_date', '<=', $d))
            ->when($f['production_product_id'] ?? null, fn ($q, $id) => $q->where('production_product_id', $id))
            ->when($mode === 'shortages', fn ($q) => $q->whereHas('usages', fn ($u) => $u->whereNull('material_batch_id')
                ->when($f['raw_material_id'] ?? null, fn ($x, $id) => $x->where('raw_material_id', $id))
                ->whereHas('rawMaterial', fn ($m) => $m->where('requires_batch', true))))
            ->orderBy('production_date')->orderBy('id')
            ->get();
        $ids = $productions->pluck('id');
        $before = $this->shortages($ids);
        $noRecipe = [];

        DB::beginTransaction();
        try {
            if ($mode === 'full') {
                // pirma atlaisvinamos visos pasirinktų gamybų partijos, tada paskirstoma iš naujo chronologiškai
                $recipes = [];
                foreach ($productions as $p) {
                    $r = $this->resolveRecipe($p->production_product_id, $p->production_date->toDateString(), $p->l_week_id);
                    if ($r) {
                        $recipes[$p->id] = $r;
                    } else {
                        $noRecipe[] = $p->id;
                    }
                }
                foreach ($productions as $p) {
                    if (isset($recipes[$p->id])) {
                        $p->usages()->get()->each->delete();
                    }
                }
                foreach ($productions as $p) {
                    $recipe = $recipes[$p->id] ?? null;
                    if (! $recipe) {
                        continue;
                    }
                    if ($p->recipe_id !== $recipe->id) {
                        $p->update(['recipe_id' => $recipe->id]);
                    }
                    $date = $p->production_date->toDateString();
                    foreach ($this->effectiveItems($recipe, $date) as $item) {
                        $needed = round($item->qty_kg_per_kg * $p->qty_produced_kg, 3);
                        if ($needed <= 0) {
                            continue;
                        }
                        $allocations = $item->rawMaterial->requires_batch
                            ? $this->stock->allocateFifo($item->raw_material_id, $needed, $date)
                            : [['batch_id' => null, 'qty_kg' => $needed]];
                        foreach ($allocations as $a) {
                            $this->addUsage($p->id, $item->raw_material_id, $a['batch_id'], $a['qty_kg']);
                        }
                    }
                }
            } else {
                foreach ($productions as $p) {
                    $date = $p->production_date->toDateString();
                    $missing = $p->usages()->whereNull('material_batch_id')
                        ->when($f['raw_material_id'] ?? null, fn ($q, $id) => $q->where('raw_material_id', $id))
                        ->whereHas('rawMaterial', fn ($m) => $m->where('requires_batch', true))->get();
                    foreach ($missing as $u) {
                        $qty = (float) $u->qty_kg;
                        $u->delete();
                        foreach ($this->stock->allocateFifo($u->raw_material_id, $qty, $date) as $a) {
                            $this->addUsage($p->id, $u->raw_material_id, $a['batch_id'], $a['qty_kg']);
                        }
                    }
                }
            }
            $after = $this->shortages($ids);
            $dryRun ? DB::rollBack() : DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        return [
            'mode'        => $mode,
            'dry_run'     => $dryRun,
            'productions' => $ids->count(),
            'no_recipe'   => $noRecipe,
            'before'      => $before,
            'after'       => $after,
        ];
    }
}
