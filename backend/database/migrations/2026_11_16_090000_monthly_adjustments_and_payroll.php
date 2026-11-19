<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 1) Mėnesio sunaudojimo korekcijos („individuali kortelė"): pagrindinė receptūra nekeičiama,
 *    korekcija pakeičia vienos žaliavos normą tik savo laikotarpio gamyboms.
 * 2) Darbo užmokesčio (DU) apskaita: darbuotojai, darbai, įkainiai su galiojimu, darbo lapai.
 *
 * Esamų lentelių duomenys NEKEIČIAMI - kuriamos tik naujos lentelės; į naują `work_operations`
 * įrašomas pradinis darbų sąrašas pagal DU aprašus (įkainių nėra - juos suveda įmonė).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipe_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_product_id')->constrained()->restrictOnDelete();
            $table->foreignId('raw_material_id')->constrained()->restrictOnDelete();
            $table->date('valid_from');
            $table->date('valid_to');
            $table->decimal('qty_kg_per_kg', 10, 6); // nauja norma kg / 1 kg produkcijos (0 = nenaudojama)
            $table->string('reason')->nullable();
            $table->boolean('is_locked')->default(false);
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['production_product_id', 'valid_from', 'valid_to'], 'recipe_adj_period_idx');
        });

        Schema::create('workers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('position', 100)->nullable();          // pareigos
            $table->string('workshop', 20)->default('sakociai');   // sakociai | kulinarija
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('work_operations', function (Blueprint $table) {
            $table->id();
            $table->string('workshop', 20)->default('sakociai');
            $table->string('stage', 20);                // eggs | mixing | baking | packing | barcoding | other
            $table->string('name', 100);
            $table->string('pay_basis', 10);            // hours | qty
            $table->string('unit', 10);                 // val | vnt | kg | m
            $table->decimal('norm_kg', 8, 3)->nullable(); // 1 kibirėlis = 11 kg; 1 maišymas = 17,5 kg
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('work_rates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_operation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('worker_id')->nullable()->constrained()->cascadeOnDelete(); // NULL = visiems
            $table->decimal('rate', 10, 4);
            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('work_entries', function (Blueprint $table) {
            $table->id();
            $table->date('work_date');
            $table->foreignId('worker_id')->constrained()->restrictOnDelete();
            $table->foreignId('work_operation_id')->constrained()->restrictOnDelete();
            $table->foreignId('production_product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('l_week_id')->nullable()->constrained()->nullOnDelete();
            $table->string('shift', 20)->nullable();
            $table->decimal('qty', 12, 3)->nullable();     // apmokamas kiekis (vnt / kg / m)
            $table->decimal('hours', 6, 2)->nullable();    // apmokamos valandos
            $table->json('details')->nullable();           // kibirėliai, maišymai, darbo laikas...
            $table->decimal('rate_applied', 10, 4)->nullable(); // užfiksuojama patvirtinus
            $table->decimal('amount', 12, 2)->nullable();
            $table->boolean('is_locked')->default(false);  // patvirtinta
            $table->foreignId('approved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('notes')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['work_date', 'worker_id']);
        });

        $now = now();
        $ops = [
            // Šakočių cechas (Sakociu_DU_aprasas)
            ['sakociai', 'eggs', 'Kiaušinių mušimas', 'qty', 'vnt', 11],
            ['sakociai', 'mixing', 'Tešlos maišymas', 'qty', 'kg', 17.5],
            ['sakociai', 'baking', 'Kepimas – suvenyriniai', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 0,140 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 0,3 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 0,5 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 1 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 2 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 3 kg', 'qty', 'kg', null],
            ['sakociai', 'baking', 'Kepimas – 10 kg', 'qty', 'kg', null],
            ['sakociai', 'packing', 'Fasavimas', 'hours', 'val', null],
            ['sakociai', 'barcoding', 'Barkodavimas ir atkrovimas', 'qty', 'kg', null],
            // Kulinarinis cechas (Kulinarinio_cecho_DU_aprasas)
            ['kulinarija', 'other', 'Bulvių skutimas', 'hours', 'val', null],
            ['kulinarija', 'other', 'Žarnų paruošimas', 'hours', 'val', null],
            ['kulinarija', 'other', 'Mėsos paruošimas', 'hours', 'val', null],
            ['kulinarija', 'other', 'Mėsos apdorojimas', 'hours', 'val', null],
            ['kulinarija', 'baking', 'Vėdarai', 'qty', 'kg', null],
            ['kulinarija', 'baking', 'Vėdarai su spirgais', 'qty', 'kg', null],
            ['kulinarija', 'baking', 'Plokštainis su spirgais', 'qty', 'kg', null],
            ['kulinarija', 'baking', 'Bulviniai blynai', 'qty', 'kg', null],
            ['kulinarija', 'baking', 'Bulviniai blynai su mėsa', 'qty', 'kg', null],
            ['kulinarija', 'packing', 'Fasavimas (kulinarija)', 'hours', 'val', null],
        ];
        DB::table('work_operations')->insert(array_map(fn ($o, $i) => [
            'workshop' => $o[0], 'stage' => $o[1], 'name' => $o[2], 'pay_basis' => $o[3], 'unit' => $o[4],
            'norm_kg' => $o[5], 'is_active' => true, 'sort_order' => $i + 1, 'created_at' => $now, 'updated_at' => $now,
        ], $ops, array_keys($ops)));
    }

    public function down(): void
    {
        Schema::dropIfExists('work_entries');
        Schema::dropIfExists('work_rates');
        Schema::dropIfExists('work_operations');
        Schema::dropIfExists('workers');
        Schema::dropIfExists('recipe_adjustments');
    }
};
