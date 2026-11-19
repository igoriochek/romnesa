<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pakeitimai (2026-11-08, kliento „Inprovements“: pakuotes.odt + Sakociu_pakuociu_lentele_PERDARYTA.xlsx):
 *  - pakavimo medžiagų rūšis (prekinė pakuotė / transportinė dėžė / perdengimas) ir kiekis pakuotėje (rafijos ritinys 200 m);
 *  - transportinės pakuotės normos pagal fasavimo rūšį ir pirkėją (dėžė, talpa vnt./dėžę, perdengimų sk.);
 *  - pakavimas su pirkėju ir dėžių skaičiumi, perpakavimas iš kitos fasavimo rūšies (pvz. Šakotis 1kg -> dėžutėje).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('packaging_materials', function (Blueprint $t) {
            $t->string('kind', 10)->default('item')->after('unit'); // item | box | overlay
            $t->decimal('pack_qty', 12, 3)->nullable()->after('kind'); // kiek vnt./m vienoje pakuotėje (pvz. rafijos ritinys 200 m)
        });

        Schema::create('transport_norms', function (Blueprint $t) {
            $t->id();
            $t->foreignId('packed_product_id')->constrained()->cascadeOnDelete();
            $t->foreignId('shop_id')->nullable()->constrained()->restrictOnDelete(); // pirkėjas; null - bendra norma
            $t->foreignId('box_material_id')->constrained('packaging_materials')->restrictOnDelete();
            $t->decimal('units_per_box', 8, 2)->nullable(); // talpa: šakočių dėžėje (null - nustatoma pakuojant)
            $t->foreignId('overlay_material_id')->nullable()->constrained('packaging_materials')->restrictOnDelete();
            $t->decimal('overlays_per_box', 6, 2)->default(0);
            $t->string('notes')->nullable();
            $t->unsignedInteger('sort_order')->default(0)->index();
            $t->timestamps();
        });

        Schema::table('packings', function (Blueprint $t) {
            $t->foreignId('shop_id')->nullable()->after('warehouse_id')->constrained()->restrictOnDelete();
            $t->unsignedInteger('boxes')->nullable()->after('shop_id');
            $t->foreignId('source_packed_product_id')->nullable()->after('boxes')->constrained('packed_products')->restrictOnDelete();
            $t->foreignId('source_warehouse_id')->nullable()->after('source_packed_product_id')->constrained('warehouses')->restrictOnDelete();
            $t->foreignId('source_movement_id')->nullable()->after('product_movement_id')->constrained('product_movements')->nullOnDelete();
        });

        \App\Support\PackagingDefaults::applyNorms();
    }

    public function down(): void
    {
        Schema::table('packings', function (Blueprint $t) {
            $t->dropConstrainedForeignId('source_movement_id');
            $t->dropConstrainedForeignId('source_warehouse_id');
            $t->dropConstrainedForeignId('source_packed_product_id');
            $t->dropColumn('boxes');
            $t->dropConstrainedForeignId('shop_id');
        });
        Schema::dropIfExists('transport_norms');
        Schema::table('packaging_materials', function (Blueprint $t) {
            $t->dropColumn(['kind', 'pack_qty']);
        });
    }
};
