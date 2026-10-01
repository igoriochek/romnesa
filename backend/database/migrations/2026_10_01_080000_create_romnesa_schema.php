<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// UAB ROMNESA - sakočių atsekamumo sistema (schema iš romnesa_database_diagram.dbml)
return new class extends Migration
{
    public function up(): void
    {
        // Rolė vartotojams (users lentelė sukurta default migracijoje)
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 30)->default('operator')->after('password'); // admin | gamyba | fasavimas | vadovybe
        });

        // ---- KLASIFIKATORIAI ----

        Schema::create('raw_materials', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('unit', 10)->default('kg');
            $table->boolean('requires_batch')->default(true);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('production_products', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique(); // Šakotis, Trapus šakotis, Sviestinis šakotis
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('packed_products', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->foreignId('production_product_id')->constrained()->cascadeOnDelete();
            $table->decimal('weight_from_kg', 6, 3)->nullable(); // Priedas A svorio intervalas
            $table->decimal('weight_to_kg', 6, 3)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('warehouses', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique(); // Fasavimo sandėlys, Gitanos sandėlys, Šaldiklis
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('shops', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('l_weeks', function (Blueprint $table) {
            $table->id();
            $table->string('code', 10)->unique(); // pvz. L276
            $table->unsignedSmallInteger('week_number');
            $table->unsignedSmallInteger('year');
            $table->date('starts_on')->nullable();
            $table->date('ends_on')->nullable();
            $table->timestamps();
        });

        // ---- RECEPTŪROS ----

        Schema::create('recipes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_product_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version')->default(1);
            $table->date('valid_from');
            $table->date('valid_to')->nullable();
            $table->foreignId('applies_to_l_week_id')->nullable()->constrained('l_weeks')->nullOnDelete();
            $table->string('change_reason')->nullable();
            $table->foreignId('approved_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['production_product_id', 'version']);
        });

        Schema::create('recipe_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('recipe_id')->constrained()->cascadeOnDelete();
            $table->foreignId('raw_material_id')->constrained()->restrictOnDelete();
            $table->decimal('qty_kg_per_kg', 10, 6);
            $table->timestamps();
        });

        // ---- ŽALIAVŲ APSKAITA ----

        Schema::create('material_batches', function (Blueprint $table) {
            $table->id();
            $table->date('received_date');
            $table->foreignId('raw_material_id')->constrained()->restrictOnDelete();
            $table->string('batch_number', 50)->unique();
            $table->decimal('qty_received_kg', 12, 3);
            $table->string('supplier', 150)->nullable();
            $table->string('invoice_number', 50)->nullable();
            $table->date('expiry_date');
            $table->string('notes')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('productions', function (Blueprint $table) {
            $table->id();
            $table->date('production_date');
            $table->foreignId('production_product_id')->constrained()->restrictOnDelete();
            $table->decimal('qty_produced_kg', 12, 3);
            $table->foreignId('l_week_id')->constrained()->restrictOnDelete();
            $table->foreignId('recipe_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('material_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('production_id')->constrained()->cascadeOnDelete();
            $table->foreignId('raw_material_id')->constrained()->restrictOnDelete();
            $table->foreignId('material_batch_id')->nullable()->constrained()->nullOnDelete(); // NULL = trūksta
            $table->decimal('qty_kg', 12, 3);
            $table->timestamps();
        });

        Schema::create('material_outflows', function (Blueprint $table) {
            $table->id();
            $table->date('outflow_date');
            $table->foreignId('material_batch_id')->constrained()->restrictOnDelete();
            $table->decimal('qty_kg', 12, 3);
            $table->string('outflow_type', 20); // transfer | writeoff
            $table->string('destination', 150)->nullable();
            $table->string('document_number', 50)->nullable();
            $table->string('notes')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // ---- PAGAMINTOS PRODUKCIJOS JUDĖJIMAS (vienas žurnalas) ----

        Schema::create('product_movements', function (Blueprint $table) {
            $table->id();
            $table->date('movement_date');
            $table->string('movement_type', 20); // pack_in | move | ship_out
            $table->foreignId('l_week_id')->constrained()->restrictOnDelete();
            $table->foreignId('packed_product_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('qty_units');
            $table->decimal('qty_kg', 12, 3);
            $table->foreignId('warehouse_from_id')->nullable()->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('warehouse_to_id')->nullable()->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('shop_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('document_number', 50)->nullable();
            $table->string('notes')->nullable();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_movements');
        Schema::dropIfExists('material_outflows');
        Schema::dropIfExists('material_usages');
        Schema::dropIfExists('productions');
        Schema::dropIfExists('material_batches');
        Schema::dropIfExists('recipe_items');
        Schema::dropIfExists('recipes');
        Schema::dropIfExists('l_weeks');
        Schema::dropIfExists('shops');
        Schema::dropIfExists('warehouses');
        Schema::dropIfExists('packed_products');
        Schema::dropIfExists('production_products');
        Schema::dropIfExists('raw_materials');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('role');
        });
    }
};
