<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pakeitimai (2026-11):
 *  - klasifikatorių ir receptūrų eilučių rikiavimas (sort_order, tempimas pele);
 *  - pakavimas: pakavimo medžiagos, jų gavimai (partijos), pakavimo specifikacijos
 *    (kiek kokios medžiagos 1 vnt. fasavimo rūšiai) ir pakavimo registravimas su sunaudojimu.
 *  - pradiniai duomenys pagal kliento sąrašą (maišeliai, dėžutės, padėliai, rafija, transportinės dėžės).
 */
return new class extends Migration
{
    private const SORTABLE = ['raw_materials', 'production_products', 'packed_products', 'warehouses', 'shops', 'recipe_items'];

    public function up(): void
    {
        foreach (self::SORTABLE as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->unsignedInteger('sort_order')->default(0)->index();
            });
        }

        Schema::create('packaging_materials', function (Blueprint $t) {
            $t->id();
            $t->string('name', 100)->unique();
            $t->string('unit', 10)->default('vnt'); // vnt | m
            $t->unsignedInteger('sort_order')->default(0)->index();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('packaging_batches', function (Blueprint $t) {
            $t->id();
            $t->date('received_date');
            $t->foreignId('packaging_material_id')->constrained()->restrictOnDelete();
            $t->string('batch_number', 50)->unique();
            $t->decimal('qty_received', 12, 3);
            $t->decimal('unit_cost_eur', 12, 4)->nullable(); // €/vnt (arba €/m)
            $t->string('supplier', 150)->nullable();
            $t->string('invoice_number', 50)->nullable();
            $t->string('notes')->nullable();
            $t->boolean('is_locked')->default(false)->index();
            $t->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('packing_specs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('packed_product_id')->constrained()->cascadeOnDelete();
            $t->foreignId('packaging_material_id')->constrained()->restrictOnDelete();
            $t->decimal('qty_per_unit', 12, 4); // kiek medžiagos 1 supakuotam vnt.
            $t->unsignedInteger('sort_order')->default(0);
            $t->timestamps();
            $t->unique(['packed_product_id', 'packaging_material_id']);
        });

        Schema::create('packings', function (Blueprint $t) {
            $t->id();
            $t->date('packing_date');
            $t->foreignId('l_week_id')->constrained()->restrictOnDelete();
            $t->foreignId('packed_product_id')->constrained()->restrictOnDelete();
            $t->decimal('unit_weight_kg', 8, 3);
            $t->unsignedInteger('qty_units');
            $t->decimal('qty_kg', 12, 3);
            $t->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            // pakavimas = fasavimo papildymas (pack_in) - produkto likutis sandėlyje
            $t->foreignId('product_movement_id')->nullable()->constrained()->nullOnDelete();
            $t->string('notes')->nullable();
            $t->boolean('is_locked')->default(false)->index();
            $t->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });

        Schema::create('packing_usages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('packing_id')->constrained()->cascadeOnDelete();
            $t->foreignId('packaging_material_id')->constrained()->restrictOnDelete();
            $t->foreignId('packaging_batch_id')->nullable()->constrained()->restrictOnDelete(); // null - be partijos
            $t->decimal('qty', 12, 3);
            $t->timestamps();
        });

        $this->seed();
    }

    /** Esama tvarka (sort_order) pagal pavadinimą + pakavimo pradiniai duomenys. */
    private function seed(): void
    {
        foreach (['raw_materials', 'production_products', 'packed_products', 'warehouses', 'shops'] as $table) {
            foreach (DB::table($table)->orderBy('name')->pluck('id') as $i => $id) {
                DB::table($table)->where('id', $id)->update(['sort_order' => $i + 1]);
            }
        }
        foreach (DB::table('recipe_items')->orderBy('id')->pluck('id') as $i => $id) {
            DB::table('recipe_items')->where('id', $id)->update(['sort_order' => $i + 1]);
        }

        \App\Support\PackagingDefaults::seed();
    }

    public function down(): void
    {
        Schema::dropIfExists('packing_usages');
        Schema::dropIfExists('packings');
        Schema::dropIfExists('packing_specs');
        Schema::dropIfExists('packaging_batches');
        Schema::dropIfExists('packaging_materials');
        foreach (self::SORTABLE as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex(['sort_order']);
                $t->dropColumn('sort_order');
            });
        }
    }
};
