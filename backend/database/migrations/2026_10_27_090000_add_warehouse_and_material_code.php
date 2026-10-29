<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Partijos sandėlis (kur laikoma žaliava) ir žaliavos kodas (pvz. K0713) - kaip naujame dizaine.
     * Abu neprivalomi, kad esami įrašai liktų galiojantys.
     */
    public function up(): void
    {
        Schema::table('raw_materials', function (Blueprint $table) {
            $table->string('code', 20)->nullable()->unique()->after('id');
        });

        Schema::table('material_batches', function (Blueprint $table) {
            $table->foreignId('warehouse_id')->nullable()->after('raw_material_id')
                ->constrained('warehouses')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('material_batches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('warehouse_id');
        });

        Schema::table('raw_materials', function (Blueprint $table) {
            $table->dropUnique(['code']);
            $table->dropColumn('code');
        });
    }
};
