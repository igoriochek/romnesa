<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\LWeek;
use App\Models\MaterialBatch;
use App\Models\MaterialOutflow;
use App\Models\Production;
use App\Models\ProductionProduct;
use App\Models\RawMaterial;
use App\Models\Recipe;
use App\Services\MaterialStockService;
use App\Services\ProductionService;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Įkelia duomenis iš Excel „SAKOCIU_PRODUKTO_ATSEKAMUMAS_STABILUS_BE_ATKURIMO naujas.xlsx"
 * (sutvarkyti į database/data/sakociu_atsekamumas.json): žaliavas, receptūras,
 * žaliavų gavimus ir gamybą. Sunaudojimas skaičiuojamas ta pačia FIFO logika kaip programoje
 * (sutampa su Excel lapu „5 PRODUKTO ATSEKAMUMAS").
 *
 *   php artisan romnesa:import-excel           - prideda trūkstamus įrašus (pakartotinai saugu)
 *   php artisan romnesa:import-excel --fresh   - prieš tai ištrina VISAS partijas, gamybas,
 *                                                sunaudojimus, perdavimus/nurašymus ir nurašymo aktus
 */
class ImportExcelData extends Command
{
    protected $signature = 'romnesa:import-excel
        {--file=database/data/sakociu_atsekamumas.json}
        {--fresh : Prieš importą ištrinti visas partijas, gamybas ir jų judėjimus}
        {--retire= : Bandomųjų partijų Nr. (kableliais): likutis nurašomas, sutampantys su Excel Nr. pervadinami į TEST-…}
        {--force : Neklausti patvirtinimo}';

    protected $description = 'Įkelia žaliavų gavimus, receptūras ir gamybą iš sutvarkyto Excel failo';

    /** Seni pavadinimai (pradiniai duomenys) -> Excel pavadinimai. */
    private const RENAME_MATERIALS = ['Margarinas "Alvas"' => 'Margarinas Šakočiui "Alvas"'];
    private const RENAME_PRODUCTS = ['Sviestinis šakotis' => 'Šakotis su sviestu'];

    public function handle(ProductionService $productions, MaterialStockService $stock): int
    {
        $path = base_path($this->option('file'));
        if (! is_file($path)) {
            $this->error("Failas nerastas: {$path}");

            return self::FAILURE;
        }
        $data = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);

        if ($this->option('fresh') && ! $this->option('force')
            && ! $this->confirm('Bus ištrintos VISOS žaliavų partijos, gamybos, sunaudojimai, perdavimai ir nurašymo aktai. Tęsti?')) {
            return self::FAILURE;
        }

        // Be modelių įvykių - kitaip istorijoje atsirastų tūkstančiai eilučių; vietoj to vienas įrašas pabaigoje
        $result = Model::withoutEvents(fn () => DB::transaction(function () use ($data, $productions) {
            if ($this->option('fresh')) {
                $this->wipe();
            }
            if ($this->option('retire')) {
                $this->retire(array_filter(array_map('trim', explode(',', $this->option('retire')))), $data['batches']);
            }
            $materials = $this->materials($data['raw_materials']);
            $products = $this->products($data);
            $this->recipes($data, $products, $materials);
            $batches = $this->batches($data['batches'], $materials);
            $made = $this->productions($data['productions'], $products, $productions);

            return compact('batches', 'made');
        }));

        $this->info("Partijos: įkelta {$result['batches']['new']}, jau buvo {$result['batches']['skip']}");
        $this->info("Gamybos: įkelta {$result['made']['new']}, jau buvo {$result['made']['skip']}");

        $this->verify($data['batches'], $stock);

        if ($result['batches']['new'] + $result['made']['new'] > 0) {
            AuditLog::create([
                'entity_type' => MaterialBatch::class,
                'entity_id'   => 0,
                'action'      => 'created',
                'label'       => 'Excel duomenų importas',
                'payload'     => [
                    'source'      => $data['source'],
                    'batches'     => $result['batches']['new'],
                    'productions' => $result['made']['new'],
                ],
            ]);
        }

        return self::SUCCESS;
    }

    private function wipe(): void
    {
        DB::table('material_usages')->delete();
        DB::table('productions')->delete();
        DB::table('material_outflows')->delete();
        DB::table('writeoff_acts')->delete();
        DB::table('material_batches')->delete();
        $this->warn('Ankstesnės partijos, gamybos ir judėjimai ištrinti.');
    }

    /**
     * Bandomosios (pavyzdinės) partijos lieka istorijoje su savo gamybomis, bet nebetrukdo tikriems duomenims:
     * likutis nurašomas (FIFO jų nebeima), o Nr., sutampantys su Excel partijomis, pervadinami į TEST-….
     */
    private function retire(array $numbers, array $excelBatches): void
    {
        $excelRows = array_column($excelBatches, null, 'batch_number');
        $stock = app(MaterialStockService::class);
        foreach ($numbers as $number) {
            $batch = MaterialBatch::where('batch_number', $number)->first();
            $excel = $excelRows[$number] ?? null;
            $isExcelBatch = $excel
                && $batch?->received_date->toDateString() === $excel['received_date']
                && abs((float) $batch->qty_received_kg - $excel['qty_received_kg']) < 0.0005;
            // jau nurašyta anksčiau arba tai jau tikra Excel partija (pakartotinis paleidimas) - neliečiama
            if (! $batch || $isExcelBatch || str_starts_with((string) $batch->notes, 'Bandomieji duomenys')) {
                continue;
            }
            $balance = $stock->batchBalance($batch);
            if ($balance > 0) {
                MaterialOutflow::create([
                    'outflow_date'      => today('Europe/Vilnius')->toDateString(),
                    'material_batch_id' => $batch->id,
                    'qty_kg'            => $balance,
                    'outflow_type'      => 'writeoff',
                    'reason'            => 'other',
                    'notes'             => 'Bandomieji duomenys – likutis nurašytas prieš Excel importą',
                ]);
            }
            $batch->notes = trim('Bandomieji duomenys. '.($batch->notes ?? ''));
            if ($excel) {
                $batch->batch_number = 'TEST-'.$number;
            }
            $batch->save();
            $this->line("Bandomoji partija {$number} → {$batch->batch_number}, nurašyta {$balance} kg");
        }
    }

    /** @return array<string, int> pavadinimas -> id */
    private function materials(array $rows): array
    {
        foreach (self::RENAME_MATERIALS as $old => $new) {
            if (! RawMaterial::where('name', $new)->exists()) {
                RawMaterial::where('name', $old)->update(['name' => $new]);
            }
        }
        foreach ($rows as $m) {
            $material = RawMaterial::firstOrNew(['name' => $m['name']]);
            $material->requires_batch = $m['requires_batch'];
            // kodas - tik jei dar nenurodytas ir neužimtas kitos žaliavos
            if (! $material->code && $m['code'] && ! RawMaterial::where('code', $m['code'])->exists()) {
                $material->code = $m['code'];
            }
            $material->save();
        }

        return RawMaterial::pluck('id', 'name')->all();
    }

    /** @return array<string, int> */
    private function products(array $data): array
    {
        foreach (self::RENAME_PRODUCTS as $old => $new) {
            if (! ProductionProduct::where('name', $new)->exists()) {
                ProductionProduct::where('name', $old)->update(['name' => $new]);
            }
        }
        $names = array_unique([...array_column($data['recipes'], 'product'), ...array_column($data['productions'], 'product')]);
        foreach ($names as $name) {
            ProductionProduct::firstOrCreate(['name' => $name]);
        }

        return ProductionProduct::pluck('id', 'name')->all();
    }

    /**
     * Excel receptūros - nauja versija nuo recipe_valid_from, jei galiojanti versija turi kitas normas.
     * Ankstesnės atviros versijos uždaromos dieną prieš.
     */
    private function recipes(array $data, array $products, array $materials): void
    {
        $from = $data['recipe_valid_from'];
        foreach ($data['recipes'] as $r) {
            $productId = $products[$r['product']];
            $wanted = collect($r['items'])->mapWithKeys(fn ($i) => [$materials[$i['raw_material']] => round($i['qty_kg_per_kg'], 6)])->sortKeys();

            $current = Recipe::with('items')->where('production_product_id', $productId)
                ->whereNull('applies_to_l_week_id')
                ->where('valid_from', '<=', $from)
                ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $from))
                ->orderByDesc('version')->first();
            $has = $current?->items->mapWithKeys(fn ($i) => [$i->raw_material_id => round((float) $i->qty_kg_per_kg, 6)])->sortKeys();
            if ($has && $has->all() == $wanted->all()) {
                continue;
            }

            Recipe::where('production_product_id', $productId)->whereNull('applies_to_l_week_id')
                ->where('valid_from', '<', $from)->whereNull('valid_to')
                ->update(['valid_to' => date('Y-m-d', strtotime("$from -1 day"))]);

            $recipe = Recipe::create([
                'production_product_id' => $productId,
                'version'               => (int) Recipe::where('production_product_id', $productId)->max('version') + 1,
                'valid_from'            => $from,
                'change_reason'         => 'Normos pagal Excel „'.$data['source'].'"',
            ]);
            $recipe->items()->createMany($wanted->map(fn ($qty, $id) => ['raw_material_id' => $id, 'qty_kg_per_kg' => $qty])->values()->all());
            $this->line("Receptūra {$r['product']} v{$recipe->version} nuo {$from}");
        }
    }

    private function batches(array $rows, array $materials): array
    {
        $new = $skip = 0;
        foreach ($rows as $b) {
            $existing = MaterialBatch::where('batch_number', $b['batch_number'])->first();
            if ($existing) {
                $same = $existing->raw_material_id === $materials[$b['raw_material']]
                    && $existing->received_date->toDateString() === $b['received_date']
                    && abs((float) $existing->qty_received_kg - $b['qty_received_kg']) < 0.0005;
                if (! $same) {
                    throw new \RuntimeException("Partija {$b['batch_number']} jau yra, bet su kitais duomenimis (Excel eilutė {$b['excel_row']}). Naudokite --fresh arba sutvarkykite ranka.");
                }
                $skip++;

                continue;
            }
            MaterialBatch::create([
                'batch_number'    => $b['batch_number'],
                'raw_material_id' => $materials[$b['raw_material']],
                'received_date'   => $b['received_date'],
                'qty_received_kg' => $b['qty_received_kg'],
                'supplier'        => $b['supplier'],
                'invoice_number'  => $b['invoice_number'],
                'expiry_date'     => $b['expiry_date'],
                'notes'           => $b['notes'],
            ]);
            $new++;
        }

        return compact('new', 'skip');
    }

    /** Gamybos chronologine tvarka - kad FIFO paskirstytų taip pat, kaip Excel. */
    private function productions(array $rows, array $products, ProductionService $service): array
    {
        $new = $skip = 0;
        usort($rows, fn ($a, $b) => [$a['production_date'], $a['excel_row']] <=> [$b['production_date'], $b['excel_row']]);

        foreach ($rows as $p) {
            $lWeek = LWeek::firstOrCreate(
                ['code' => $p['l_week']],
                ['week_number' => (int) substr($p['l_week'], 1, -1), 'year' => (int) substr($p['production_date'], 0, 4)]
            );
            $productId = $products[$p['product']];

            $exists = Production::where('production_date', $p['production_date'])
                ->where('production_product_id', $productId)
                ->where('l_week_id', $lWeek->id)
                ->where('qty_produced_kg', $p['qty_produced_kg'])
                ->exists();
            if ($exists) {
                $skip++;

                continue;
            }

            $recipe = $service->resolveRecipe($productId, $p['production_date'], $lWeek->id)
                ?? throw new \RuntimeException("Nėra receptūros: {$p['product']} {$p['production_date']}");
            $service->create([
                'production_date'       => $p['production_date'],
                'production_product_id' => $productId,
                'qty_produced_kg'       => $p['qty_produced_kg'],
                'l_week_id'             => $lWeek->id,
                'notes'                 => null,
            ], $recipe, collect(), null);
            $new++;
        }

        return compact('new', 'skip');
    }

    /** Partijų likučiai palyginami su Excel „Likutis po FIFO" stulpeliu. */
    private function verify(array $rows, MaterialStockService $stock): void
    {
        $diff = [];
        $numbers = array_column($rows, 'batch_number');
        foreach ($rows as $b) {
            // pasikartojančio Nr. partijoms Excel likutis skaičiuotas sujungus kelias partijas - nelyginama
            $duplicated = $b['notes'] || in_array($b['batch_number'].'-2', $numbers, true);
            if ($b['excel_balance_kg'] === null || $duplicated) {
                continue;
            }
            $batch = MaterialBatch::where('batch_number', $b['batch_number'])->first();
            $balance = $batch ? $stock->batchBalance($batch) : null;
            if ($balance === null || abs($balance - $b['excel_balance_kg']) > 0.01) {
                $diff[] = [$b['batch_number'], $b['excel_balance_kg'], $balance];
            }
        }

        $shortages = DB::table('material_usages')->whereNull('material_batch_id')
            ->join('raw_materials', 'raw_materials.id', '=', 'material_usages.raw_material_id')
            ->where('raw_materials.requires_batch', true)->count();
        $this->info("TRŪKSTA eilučių: {$shortages}");

        if ($diff) {
            $this->warn('Likučiai nesutampa su Excel (Excel kg / programa kg):');
            $this->table(['Partija', 'Excel', 'Programa'], $diff);
        } else {
            $this->info('Visų partijų likučiai sutampa su Excel „Likutis po FIFO".');
        }
    }
}
