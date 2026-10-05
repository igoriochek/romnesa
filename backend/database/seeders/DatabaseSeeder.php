<?php

namespace Database\Seeders;

use App\Models\LWeek;
use App\Models\MaterialBatch;
use App\Models\PackedProduct;
use App\Models\ProductionProduct;
use App\Models\RawMaterial;
use App\Models\Recipe;
use App\Models\RecipeItem;
use App\Models\Shop;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     * Klasifikatoriai pagal Excel failus (SĄRAŠAI / Nustatymai lapai).
     */
    public function run(): void
    {
        User::factory()->create([
            'name' => 'Admin',
            'email' => 'admin@romnesa.lt',
            'password' => 'password',
            'role' => 'admin',
        ]);

        // Žaliavos (vnt = kg; kiaušiniai perskaičiuojami 0.06 kg/vnt)
        foreach (['Miltai', 'Pienas', 'Kiaušiniai', 'Cukrus', 'Sviestas', 'Margarinas "Alvas"', 'Grietinės mišinys', 'Kvapnioji medžiaga', 'Ciberžolė'] as $name) {
            RawMaterial::firstOrCreate(['name' => $name]);
        }
        RawMaterial::firstOrCreate(['name' => 'Vanduo'], ['requires_batch' => false]);

        // Gamybinės rūšys - tik 3
        $sakotis = ProductionProduct::firstOrCreate(['name' => 'Šakotis']);
        $trapus  = ProductionProduct::firstOrCreate(['name' => 'Trapus šakotis']);
        $sviest  = ProductionProduct::firstOrCreate(['name' => 'Sviestinis šakotis']);

        // Fasavimo rūšys (SĄRAŠAI "Šakočių rūšys")
        foreach ([
            ['Šakotis 1kg dėžutėje', $sakotis->id],
            ['Populiarus Palink 0,5', $trapus->id],
            ['Trapus Palink 0,5', $trapus->id],
            ['Trapus 0,5', $trapus->id],
            ['Trapus 1kg', $trapus->id],
            ['Sviestinis 0,5', $sviest->id],
            ['Depo 1 kg', $sakotis->id],
            ['Bočių', $sakotis->id],
        ] as [$name, $prodId]) {
            PackedProduct::firstOrCreate(['name' => $name], ['production_product_id' => $prodId]);
        }

        // Sandėliai
        foreach (['Fasavimo sandėlys', 'Gitanos sandėlys', 'Šaldiklis'] as $name) {
            Warehouse::firstOrCreate(['name' => $name]);
        }

        // Parduotuvės
        foreach (['Palink', 'BLS', 'Aibe', 'Bim-Bam', 'Danalta', 'Rimi', 'Rivona', 'Lakaja', 'Andoma', 'Depo'] as $name) {
            Shop::firstOrCreate(['name' => $name]);
        }

        // L savaitės (2026 m.)
        for ($week = 27; $week <= 52; $week++) {
            LWeek::firstOrCreate(
                ['code' => 'L' . $week . '6'],
                ['week_number' => $week, 'year' => 2026]
            );
        }

        // ---- Receptūros (kg žaliavos / 1 kg produkto) ----
        $rm = RawMaterial::pluck('id', 'name');

        $recipes = [
            $sakotis->id => [
                'Miltai' => 0.40, 'Kiaušiniai' => 0.25, 'Cukrus' => 0.12,
                'Sviestas' => 0.10, 'Pienas' => 0.10, 'Vanduo' => 0.03,
            ],
            $trapus->id => [
                'Miltai' => 0.38, 'Kiaušiniai' => 0.20, 'Cukrus' => 0.15,
                'Margarinas "Alvas"' => 0.12, 'Pienas' => 0.10, 'Ciberžolė' => 0.02,
            ],
            $sviest->id => [
                'Miltai' => 0.35, 'Kiaušiniai' => 0.22, 'Cukrus' => 0.15,
                'Sviestas' => 0.15, 'Grietinės mišinys' => 0.08, 'Kvapnioji medžiaga' => 0.005,
            ],
        ];

        foreach ($recipes as $productId => $items) {
            $recipe = Recipe::firstOrCreate(
                ['production_product_id' => $productId, 'version' => 1],
                ['valid_from' => '2026-01-01', 'approved_by_id' => 1]
            );
            foreach ($items as $name => $perKg) {
                RecipeItem::firstOrCreate(
                    ['recipe_id' => $recipe->id, 'raw_material_id' => $rm[$name]],
                    ['qty_kg_per_kg' => $perKg]
                );
            }
        }

        // ---- Pavyzdinės žaliavų partijos (FIFO testavimui) ----
        $batches = [
            ['Miltai',             'Mil0630', '2026-06-30', 200, '2026-12-31', 'UAB Malsena', 'SF-1021'],
            ['Miltai',             'Mil0815', '2026-08-15', 300, '2027-02-15', 'UAB Malsena', 'SF-1150'],
            ['Kiaušiniai',         'K0713',   '2026-07-13', 120, '2026-08-10', 'Kiaušinių ūkis', 'KV-552'],
            ['Kiaušiniai',         'K0920',   '2026-09-20', 150, '2026-10-20', 'Kiaušinių ūkis', 'KV-618'],
            ['Cukrus',             'C0701',   '2026-07-01', 100, '2027-07-01', 'Nordic Sugar', 'NS-330'],
            ['Sviestas',           'Sv0805',  '2026-08-05', 80,  '2026-11-05', 'Pieno žvaigždės', 'PZ-910'],
            ['Pienas',             'P0701',   '2026-07-01', 90,  '2026-10-15', 'Rokiškio sūris', 'RS-104'],
            ['Margarinas "Alvas"', 'Mg0810',  '2026-08-10', 60,  '2027-01-10', 'Alvas', 'AL-77'],
            ['Grietinės mišinys',  'Gr0915',  '2026-09-15', 50,  '2026-11-15', 'Pieno žvaigždės', 'PZ-988'],
            ['Ciberžolė',          'Cb0601',  '2026-06-01', 5,   '2028-06-01', 'SpiceCo', 'SC-12'],
            ['Kvapnioji medžiaga', 'Kv0601',  '2026-06-01', 3,   '2028-01-01', 'Aroma', 'AR-3'],
            ['Vanduo',             'V001',    '2026-01-01', 9999,'2030-01-01', 'Vandentiekyra', null],
        ];

        foreach ($batches as [$name, $num, $received, $qty, $expiry, $supplier, $invoice]) {
            MaterialBatch::firstOrCreate(
                ['batch_number' => $num],
                [
                    'raw_material_id' => $rm[$name],
                    'received_date'   => $received,
                    'qty_received_kg' => $qty,
                    'expiry_date'     => $expiry,
                    'supplier'        => $supplier,
                    'invoice_number'  => $invoice,
                ]
            );
        }

        // Svorio intervalai fasavimo rūšims (Priedas A)
        PackedProduct::where('name', 'Trapus 0,5')->update(['weight_from_kg' => 0.40, 'weight_to_kg' => 0.60]);
        PackedProduct::where('name', 'Trapus 1kg')->update(['weight_from_kg' => 0.90, 'weight_to_kg' => 1.10]);
        PackedProduct::where('name', 'Sviestinis 0,5')->update(['weight_from_kg' => 0.40, 'weight_to_kg' => 0.60]);
        PackedProduct::where('name', 'Depo 1 kg')->update(['weight_from_kg' => 0.90, 'weight_to_kg' => 1.10]);
        PackedProduct::where('name', 'Šakotis 1kg dėžutėje')->update(['weight_from_kg' => 0.90, 'weight_to_kg' => 1.10]);
        PackedProduct::where('name', 'Populiarus Palink 0,5')->update(['weight_from_kg' => 0.40, 'weight_to_kg' => 0.60]);
        PackedProduct::where('name', 'Trapus Palink 0,5')->update(['weight_from_kg' => 0.40, 'weight_to_kg' => 0.60]);
        PackedProduct::where('name', 'Bočių')->update(['weight_from_kg' => 1.50, 'weight_to_kg' => 3.00]);
    }
}
