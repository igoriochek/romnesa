<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Žaliavų partijos savikaina, EUR už kg (neprivaloma).
     */
    public function up(): void
    {
        Schema::table('material_batches', function (Blueprint $table) {
            $table->decimal('unit_cost_eur', 12, 4)->nullable()->after('qty_received_kg');
        });
    }

    public function down(): void
    {
        Schema::table('material_batches', function (Blueprint $table) {
            $table->dropColumn('unit_cost_eur');
        });
    }
};
