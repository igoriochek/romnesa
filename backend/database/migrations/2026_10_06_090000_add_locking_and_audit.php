<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Įsipareigojimo („įspajamo") blokavimas + pilna registracijų istorija.
     * is_locked=true -> įrašas negali būti taisomas/naikinamas
     * (gamyba: naikinti gamybą reiškia atlaisvinti partijas - blokuojame).
     */
    public function up(): void
    {
        foreach (['material_batches', 'productions', 'material_outflows', 'product_movements'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->boolean('is_locked')->default(false)->index();
            });
        }

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->string('entity_type')->index();        // pvz. App\Models\Production
            $t->unsignedBigInteger('entity_id')->index();
            $t->string('action', 20)->index();         // created|updated|deleted|locked
            $t->string('label')->nullable();           // žmogui skaitomas pavadinimas, pvz. "Partija Mil0630"
            $t->json('payload')->nullable();           // požymiai/senų->naujų reikšmių pakeitimai
            $t->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        foreach (['material_batches', 'productions', 'material_outflows', 'product_movements'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->dropIndex(['is_locked']);
                $t->dropColumn('is_locked');
            });
        }
    }
};
