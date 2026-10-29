<?php

namespace Database\Seeders;

use App\Models\LWeek;
use App\Models\PackedProduct;
use App\Models\ProductionProduct;
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
        // Admin jau sukuriamas migracijoje (add_username_to_users) - čia tik jei jo nėra
        User::firstOrCreate(['username' => 'Admin'], [
            'name' => 'Admin',
            'email' => 'admin@romnesa.lt',
            'password' => 'admin',
            'role' => 'admin',
        ]);

        // Žaliavos, receptūros, gavimai ir gamyba - iš Excel (romnesa:import-excel) žemiau

        // Gamybinės rūšys - tik 3
        $sakotis = ProductionProduct::firstOrCreate(['name' => 'Šakotis']);
        $trapus  = ProductionProduct::firstOrCreate(['name' => 'Trapus šakotis']);
        $sviest  = ProductionProduct::firstOrCreate(['name' => 'Šakotis su sviestu']);

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

        // ---- Žaliavos, receptūros, žaliavų gavimai ir gamyba (Excel „SAKOCIU_PRODUKTO_ATSEKAMUMAS_STABILUS_BE_ATKURIMO naujas") ----
        $this->command->call('romnesa:import-excel');

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
