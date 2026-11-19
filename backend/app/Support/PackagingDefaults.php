<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Pakavimo pradiniai duomenys pagal kliento sąrašą (2026-11 pakeitimai):
 * pakavimo medžiagos, trūkstamos fasavimo rūšys ir jų pakavimo specifikacijos.
 * Kartojant nieko nedubliuoja (esami įrašai nekeičiami).
 */
class PackagingDefaults
{
    public static function seed(): void
    {
        // po 2026-11-08 migracijos medžiagos pervadintos - senasis sąrašas nebetaikomas (kitaip atsirastų dublikatai)
        if (! \Illuminate\Support\Facades\Schema::hasTable('transport_norms')) {
            (new self)->run();
        }
        self::applyNorms();
    }

    /** Normalizuotas pavadinimas palyginimui (be diakritikų, mažosiomis). */
    private static function norm(string $s): string
    {
        $s = mb_strtolower(trim($s));
        return strtr($s, ['ą' => 'a', 'č' => 'c', 'ę' => 'e', 'ė' => 'e', 'į' => 'i', 'š' => 's', 'ų' => 'u', 'ū' => 'u', 'ž' => 'z']);
    }

    /**
     * Kliento pakuočių lentelė (2026-11-08, „Sakociu_pakuociu_lentele_PERDARYTA.xlsx“ + pakuotes.odt):
     * medžiagų pavadinimai su matmenimis, perdengimai, prekinės pakuotės normos (maišelis + padėlis + rafija + dėžutė)
     * ir transportinės pakuotės normos pagal pirkėją. Kartojant nedubliuoja; specifikacijos lentelėje išvardintoms
     * fasavimo rūšims perrašomos pagal lentelę, transportinės normos pridedamos tik jei tokios dar nėra.
     */
    public static function applyNorms(): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('transport_norms')) {
            return;
        }
        $now = now();

        // --- pakavimo medžiagos: [raktas, pavadinimas, senas pavadinimas, matas, rūšis, kiekis pakuotėje]
        $materials = [
            ['skaidrus', 'BOPP skaidrus 350×450', 'Skaidrus maišelis', 'vnt', 'item', null],
            ['zalias', 'BOPP žalias 350×450', 'Žalias maišelis', 'vnt', 'item', null],
            ['rudas', 'BOPP rudas 350×450', 'Rudas maišelis', 'vnt', 'item', null],
            ['geltonas', 'BOPP geltona žvaigždė 400×550', 'Maišelis su geltona žvaigždute', 'vnt', 'item', null],
            ['k3234', 'BOPP skaidrus baltu kraštu 32/34', 'Skaidrus maišelis su baltu krašteliu', 'vnt', 'item', null],
            ['k2224', 'BOPP skaidrus baltu kraštu 22/24', null, 'vnt', 'item', null],
            ['p05', 'Padėlis 0,5 kg 180×180×3', 'Padėlis 0,5', 'vnt', 'item', null],
            ['p032', 'Padėlis 0,32 kg 130×130×3', 'Padėlis 0,32', 'vnt', 'item', null],
            ['p014', 'Padėlis 0,14 kg 90×90×3', 'Padėlis 0,14', 'vnt', 'item', null],
            ['rafija', 'Rafija', null, 'm', 'item', 200],
            ['d1', 'Žalia dėžutė 1 kg', 'Žalia dėžutė 1kg', 'vnt', 'item', null],
            ['d05', 'Žalia dėžutė 0,5 kg', 'Žalia dėžutė 0,5kg', 'vnt', 'item', null],
            ['d032', 'Geltona dėžutė 0,32 kg', 'Geltona dėžutė 0,32kg', 'vnt', 'item', null],
            ['d014', 'Geltona dėžutė 0,14 kg', 'Geltona dėžutė 0,14kg', 'vnt', 'item', null],
            ['kubikas', 'Kubikas 388×388×388', 'Kubikas (transportinė dėžė)', 'vnt', 'box', null],
            ['pop', 'POP dėžė 592×392×400', 'POP dėžė (transportinė dėžė)', 'vnt', 'box', null],
            ['puse', 'Pusė kubo 388×388×186', 'Pusė kubiko (transportinė dėžė)', 'vnt', 'box', null],
            ['mazas', 'Mažas perdengimas 388×388', null, 'vnt', 'overlay', null],
            ['didelis', 'Didelis perdengimas 590×390', null, 'vnt', 'overlay', null],
        ];
        $mat = [];
        foreach ($materials as $i => [$key, $name, $old, $unit, $kind, $packQty]) {
            $id = DB::table('packaging_materials')->where('name', $name)->value('id');
            if (! $id && $old) {
                $id = DB::table('packaging_materials')->where('name', $old)->value('id');
                if ($id) {
                    DB::table('packaging_materials')->where('id', $id)->update(['name' => $name, 'updated_at' => $now]);
                }
            }
            if ($id) {
                DB::table('packaging_materials')->where('id', $id)->update(['kind' => $kind, 'pack_qty' => $packQty, 'sort_order' => $i + 1]);
            } else {
                $id = DB::table('packaging_materials')->insertGetId([
                    'name' => $name, 'unit' => $unit, 'kind' => $kind, 'pack_qty' => $packQty, 'sort_order' => $i + 1,
                    'is_active' => true, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $mat[$key] = $id;
        }

        // --- gamybinės rūšys (be jų - tuščia DB, nieko nedarom)
        $prod = DB::table('production_products')->pluck('id', 'name');
        $sakotis = $prod['Šakotis'] ?? null;
        $trapus = $prod['Trapus šakotis'] ?? null;
        if (! $sakotis || ! $trapus) {
            return;
        }

        // --- pirkėjai (parduotuvių klasifikatorius)
        $shops = DB::table('shops')->get(['id', 'name']);
        $shop = function (string $name) use (&$shops, $now) {
            $hit = $shops->first(fn ($s) => self::norm($s->name) === self::norm($name));
            if ($hit) {
                return $hit->id;
            }
            $id = DB::table('shops')->insertGetId([
                'name' => $name, 'is_active' => true, 'sort_order' => (int) DB::table('shops')->max('sort_order') + 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            $shops->push((object) ['id' => $id, 'name' => $name]);
            return $id;
        };

        // --- fasavimo rūšys (trūkstamos sukuriamos)
        $packedId = function (string $name, int $prodId) use ($now) {
            $id = DB::table('packed_products')->where('name', $name)->value('id');
            return $id ?: DB::table('packed_products')->insertGetId([
                'name' => $name, 'production_product_id' => $prodId, 'is_active' => true,
                'sort_order' => (int) DB::table('packed_products')->max('sort_order') + 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        };

        // [fasavimo rūšis, gamybinė rūšis, maišelis, padėlis, dėžutė]  (+ rafija 0,35 m visiems)
        $sviest = $prod['Šakotis su sviestu'] ?? $prod['Sviestinis šakotis'] ?? $sakotis;
        $primary = [
            ['Trapus 0,5', $trapus, 'rudas', 'p05', null],
            ['Trapus 1kg', $trapus, 'geltonas', 'p05', null],
            ['Trapus 0,32kg', $trapus, 'k3234', 'p032', null],
            ['Trapus Palink 0,5', $trapus, 'rudas', 'p05', null],
            ['Populiarus 0,5', $trapus, 'skaidrus', 'p05', null],
            ['Populiarus Palink 0,5', $trapus, 'skaidrus', 'p05', null],
            ['Sviestinis 0,5', $sviest, 'skaidrus', 'p05', null],
            ['Sviestinis 0,32kg', $sviest, 'k3234', 'p032', null],
            ['Sviestinis 1kg', $sviest, 'geltonas', 'p05', null],
            ['Bočiai 0,5kg', $sakotis, 'skaidrus', 'p05', null],
            ['Šakotis 1kg', $sakotis, 'zalias', 'p05', null],
            ['Šakotis 0,5kg', $sakotis, 'zalias', 'p05', null],
            ['Šakotis 0,32kg', $sakotis, 'k3234', 'p032', null],
            ['Šakotis 0,14kg', $sakotis, 'k2224', 'p014', null],
            ['Šakotis 0,14kg Palink', $sakotis, 'k2224', 'p014', null],
            ['Šakotis 1kg dėžutėje', $sakotis, 'zalias', 'p05', 'd1'],
            ['Šakotis 0,5kg dėžutėje', $sakotis, 'zalias', 'p05', 'd05'],
            ['Šakotis 0,32kg dėžutėje', $sakotis, 'k3234', 'p032', 'd032'],
            ['Šakotis 0,14kg dėžutėje', $sakotis, 'k2224', 'p014', 'd014'],
            ['Depo 1 kg', $sakotis, 'geltonas', 'p05', null],
            ['Depo 0,5kg', $sakotis, 'zalias', 'p05', null],
            ['Depo 1kg dėžutėje', $sakotis, 'geltonas', 'p05', 'd1'],
            ['Depo 0,5kg dėžutėje', $sakotis, 'zalias', 'p05', 'd05'],
        ];
        $pp = [];
        foreach ($primary as [$name, $prodId, $bag, $pad, $box]) {
            $id = $pp[$name] = $packedId($name, $prodId);
            DB::table('packing_specs')->where('packed_product_id', $id)->delete();
            $j = 0;
            foreach (array_filter([$bag => 1, $pad => 1, 'rafija' => 0.35, ...($box ? [$box => 1] : [])]) as $key => $qty) {
                DB::table('packing_specs')->insert([
                    'packed_product_id' => $id, 'packaging_material_id' => $mat[$key], 'qty_per_unit' => $qty,
                    'sort_order' => ++$j, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }

        // [fasavimo rūšis, pirkėjas (null - bendra), dėžė, talpa vnt./dėžę, perdengimas, perdengimų/dėžę, pastaba]
        $transport = [
            ['Trapus 0,5', 'BLS', 'kubikas', null, 'mazas', 1, 'pagal svorį 6–8 vnt. į dėžę'],
            ['Šakotis 0,5kg', 'BLS', 'kubikas', null, 'mazas', 1, 'pagal svorį 6–8 vnt. į dėžę'],
            ['Šakotis 0,5kg dėžutėje', 'BLS', 'kubikas', null, null, 0, 'pagal svorį 6–8 vnt. į dėžę'],
            ['Populiarus 0,5', 'BLS', 'pop', null, 'didelis', 1, 'pagal svorį 14–16 vnt. į dėžę'],
            ['Trapus 1kg', 'Rivona', 'kubikas', null, 'mazas', 1, 'pagal svorį 3–4 vnt. į dėžę'],
            ['Trapus 0,5', 'Rivona', 'kubikas', null, 'mazas', 1, 'pagal svorį 7–8 vnt. į dėžę'],
            ['Sviestinis 0,5', 'Rivona', 'kubikas', null, 'mazas', 1, 'pagal svorį 7–8 vnt. į dėžę'],
            ['Sviestinis 0,32kg', 'Rivona', 'kubikas', null, 'mazas', 1, 'pagal svorį 7–8 vnt. į dėžę'],
            ['Populiarus 0,5', 'Rivona', 'kubikas', 4, null, 0, null],
            ['Šakotis 1kg dėžutėje', 'Rivona', 'kubikas', 4, null, 0, null],
            ['Šakotis 1kg dėžutėje', 'Rimi', 'kubikas', null, 'mazas', 1, null],
            ['Trapus 1kg', 'Rimi', 'kubikas', 4, 'mazas', 1, 'į 1 dėžę dedama 2 vnt. 1 kg + pagal svorį 5–6 vnt. 0,5 kg'],
            ['Trapus 0,5', 'Rimi', 'kubikas', 2, 'mazas', 1, 'į 1 dėžę dedama 2 vnt. 1 kg + pagal svorį 5–6 vnt. 0,5 kg'],
            ['Šakotis 0,14kg dėžutėje', 'Rimi', 'puse', null, null, 0, 'suvenyrinis; pagal svorį 15–18 vnt. į dėžę'],
            ['Bočiai 0,5kg', 'Palink', 'kubikas', 8, 'mazas', 1, null],
            ['Populiarus Palink 0,5', 'Palink', 'kubikas', 8, 'mazas', 1, null],
            ['Šakotis 0,32kg dėžutėje', 'Palink', 'kubikas', 10, null, 0, null],
            ['Trapus Palink 0,5', 'Palink', 'puse', 5, null, 0, null],
            ['Depo 1 kg', 'Depo', 'kubikas', 4, null, 0, null],
            ['Depo 0,5kg', 'Depo', 'kubikas', 8, 'mazas', 1, null],
            ['Depo 1kg dėžutėje', 'Depo', 'kubikas', 4, null, 0, null],
            ['Depo 0,5kg dėžutėje', 'Depo', 'kubikas', 8, null, 0, null],
            ['Šakotis 0,32kg', 'Bolt', 'puse', 9, null, 0, null],
            ['Šakotis 0,14kg dėžutėje', 'Aibė', 'puse', 18, null, 0, 'perdengimo nereikia'],
            ['Šakotis 0,14kg Palink', 'Kioskai', 'puse', 30, 'mazas', 1, null],
            ['Šakotis 0,5kg', 'Norris', 'kubikas', 8, 'mazas', 1, null],
            ['Šakotis 1kg', 'Norris', 'kubikas', 4, 'mazas', 1, null],
            ['Trapus 0,5', null, 'kubikas', 8, 'mazas', 1, null],
            ['Trapus 1kg', null, 'kubikas', 4, null, 0, null],
        ];
        $order = (int) DB::table('transport_norms')->max('sort_order');
        foreach ($transport as [$name, $buyer, $box, $cap, $overlay, $overlays, $notes]) {
            $shopId = $buyer ? $shop($buyer) : null;
            $exists = DB::table('transport_norms')->where('packed_product_id', $pp[$name])
                ->where(fn ($q) => $shopId ? $q->where('shop_id', $shopId) : $q->whereNull('shop_id'))->exists();
            if ($exists) {
                continue;
            }
            DB::table('transport_norms')->insert([
                'packed_product_id' => $pp[$name], 'shop_id' => $shopId, 'box_material_id' => $mat[$box],
                'units_per_box' => $cap, 'overlay_material_id' => $overlay ? $mat[$overlay] : null,
                'overlays_per_box' => $overlays, 'notes' => $notes, 'sort_order' => ++$order,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }
    }

    private function run(): void
    {
        $now = now();
        $materials = [
            ['Skaidrus maišelis', 'vnt'],
            ['Maišelis su geltona žvaigždute', 'vnt'],
            ['Žalias maišelis', 'vnt'],
            ['Skaidrus maišelis su baltu krašteliu', 'vnt'],
            ['Rudas maišelis', 'vnt'],
            ['Žalia dėžutė 1kg', 'vnt'],
            ['Žalia dėžutė 0,5kg', 'vnt'],
            ['Geltona dėžutė 0,32kg', 'vnt'],
            ['Geltona dėžutė 0,14kg', 'vnt'],
            ['Padėlis 0,5', 'vnt'],
            ['Padėlis 0,32', 'vnt'],
            ['Padėlis 0,14', 'vnt'],
            ['Rafija', 'm'],
            ['Kubikas (transportinė dėžė)', 'vnt'],
            ['POP dėžė (transportinė dėžė)', 'vnt'],
            ['Pusė kubiko (transportinė dėžė)', 'vnt'],
        ];
        $mat = [];
        foreach ($materials as $i => [$name, $unit]) {
            $id = DB::table('packaging_materials')->where('name', $name)->value('id')
                ?? DB::table('packaging_materials')->insertGetId([
                    'name' => $name, 'unit' => $unit, 'sort_order' => $i + 1, 'is_active' => true,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            $mat[$name] = $id;
        }

        $prod = DB::table('production_products')->pluck('id', 'name');
        $sakotis = $prod['Šakotis'] ?? null;
        $trapus = $prod['Trapus šakotis'] ?? null;
        $sviest = $prod['Šakotis su sviestu'] ?? $prod['Sviestinis šakotis'] ?? null;
        if (! $sakotis || ! $trapus || ! $sviest) {
            return; // tuščia DB (pvz. testai) - fasavimo rūšis sukurs seeder'is
        }

        // [fasavimo rūšis, gamybinė rūšis, svoris nuo, iki, [medžiaga => kiekis 1 vnt.]]
        $rafija = ['Rafija' => 0.35]; // 35 cm surišimui
        $packed = [
            ['Bočiai 0,5kg', $sakotis, null, null, ['Skaidrus maišelis' => 1]],
            ['Depo 1 kg', $sakotis, 0.9, 1.1, ['Maišelis su geltona žvaigždute' => 1]],
            ['Depo 0,5kg', $sakotis, null, null, ['Žalias maišelis' => 1]],
            ['Sviestinis 0,5', $sviest, 0.4, 0.6, ['Skaidrus maišelis' => 1]],
            ['Sviestinis 1kg', $sviest, null, null, ['Maišelis su geltona žvaigždute' => 1]],
            ['Sviestinis 0,32kg', $sviest, null, null, ['Skaidrus maišelis su baltu krašteliu' => 1]],
            ['Trapus 1kg', $trapus, 0.9, 1.1, ['Rudas maišelis' => 1]],
            ['Trapus 0,5', $trapus, 0.4, 0.6, ['Rudas maišelis' => 1]],
            ['Trapus 0,32kg', $trapus, null, null, ['Skaidrus maišelis su baltu krašteliu' => 1]],
            ['Trapus Palink 0,5', $trapus, 0.4, 0.6, ['Rudas maišelis' => 1]],
            ['Populiarus 0,5', $trapus, null, null, ['Skaidrus maišelis' => 1]],
            ['Populiarus Palink 0,5', $trapus, 0.4, 0.6, ['Skaidrus maišelis' => 1]],
            ['Šakotis 1kg', $sakotis, null, null, ['Padėlis 0,5' => 1, ...$rafija]],
            ['Šakotis 0,5kg', $sakotis, null, null, ['Žalias maišelis' => 1, 'Padėlis 0,5' => 1, ...$rafija]],
            ['Šakotis 0,32kg', $sakotis, null, null, ['Skaidrus maišelis su baltu krašteliu' => 1, 'Padėlis 0,32' => 1, ...$rafija]],
            ['Šakotis 0,14kg', $sakotis, null, null, ['Skaidrus maišelis su baltu krašteliu' => 1, 'Padėlis 0,14' => 1, ...$rafija]],
            ['Šakotis 1kg dėžutėje', $sakotis, 0.9, 1.1, ['Žalia dėžutė 1kg' => 1, 'Padėlis 0,5' => 1]],
            ['Šakotis 0,5kg dėžutėje', $sakotis, null, null, ['Žalia dėžutė 0,5kg' => 1, 'Padėlis 0,5' => 1]],
            ['Šakotis 0,32kg dėžutėje', $sakotis, null, null, ['Geltona dėžutė 0,32kg' => 1, 'Padėlis 0,32' => 1]],
            ['Šakotis 0,14kg dėžutėje', $sakotis, null, null, ['Geltona dėžutė 0,14kg' => 1, 'Padėlis 0,14' => 1]],
        ];

        $order = (int) DB::table('packed_products')->max('sort_order');
        foreach ($packed as [$name, $prodId, $from, $to, $spec]) {
            $id = DB::table('packed_products')->where('name', $name)->value('id');
            if (! $id) {
                $id = DB::table('packed_products')->insertGetId([
                    'name' => $name, 'production_product_id' => $prodId,
                    'weight_from_kg' => $from, 'weight_to_kg' => $to, 'is_active' => true,
                    'sort_order' => ++$order, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $j = 0;
            foreach ($spec as $material => $qty) {
                DB::table('packing_specs')->insertOrIgnore([
                    'packed_product_id' => $id, 'packaging_material_id' => $mat[$material],
                    'qty_per_unit' => $qty, 'sort_order' => ++$j, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        }
    }
}
