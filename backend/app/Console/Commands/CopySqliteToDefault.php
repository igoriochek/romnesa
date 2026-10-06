<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Nukopijuoja duomenis iš SQLite (backend/database/database.sqlite)
 * į numatytąją jungtį (MySQL). Paleidimas:
 *   php artisan db:copy-sqlite
 * Prieš tai: .env DB_CONNECTION=mysql + DB_*, o php artisan migrate sukurs lenteles.
 */
class CopySqliteToDefault extends Command
{
    protected $signature = 'db:copy-sqlite {--file=database/database.sqlite}';
    protected $description = 'Perkelia visus duomenis iš SQLite failo į numatytą DB (MySQL), išsaugant ID';

    private array $tables = [
        'users', 'personal_access_tokens',
        'raw_materials', 'production_products', 'packed_products',
        'warehouses', 'shops', 'l_weeks',
        'recipes', 'recipe_items', 'material_batches', 'productions',
        'material_usages', 'material_outflows', 'product_movements',
        'audit_logs',
    ];

    public function handle(): int
    {
        $file = database_path(str_replace('database/', '', $this->option('file')));
        if (! file_exists($file)) {
            $this->error("SQLite failas nerastas: {$file}");
            return self::FAILURE;
        }

        config(['database.connections.src' => ['driver' => 'sqlite', 'database' => $file]]);
        $src = DB::connection('src');
        $dst = DB::connection();

        $driver = $dst->getDriverName();
        if ($driver !== 'sqlite') {
            $dst->statement('SET FOREIGN_KEY_CHECKS=0');
            $dst->statement('SET SESSION sql_mode="STRICT_TRANS_TABLES"');
        }

        foreach ($this->tables as $table) {
            try {
                $rows = $src->table($table)->get()->map(fn ($r) => (array) $r);
            } catch (\Throwable) {
                $this->line("  · {$table}: nėra šaltinyje, praleidžiama");
                continue;
            }

            $dst->table($table)->delete();
            foreach (array_chunk($rows->all(), 200) as $chunk) {
                $dst->table($table)->insert($chunk);
            }
            $this->info("  ✓ {$table}: {$rows->count()} įrašų");
        }

        if ($driver !== 'sqlite') {
            $dst->statement('SET FOREIGN_KEY_CHECKS=1');
        }

        $this->info('Duomenys perkelti.');
        return self::SUCCESS;
    }
}
