<?php

namespace Database\Seeders;

use App\Models\LWeek;
use App\Models\PackedProduct;
use App\Models\ProductionProduct;
use App\Models\RawMaterial;
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
    }
}
