<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brokas apmokamas kaip 2 rūšies gaminiai mažesniu tarifu:
 * įkainis gauna antrą kainą (už 2 rūšies / broko kg).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('work_rates', function (Blueprint $t) {
            $t->decimal('rate_2nd', 10, 4)->nullable()->after('rate');
        });
    }

    public function down(): void
    {
        Schema::table('work_rates', function (Blueprint $t) {
            $t->dropColumn('rate_2nd');
        });
    }
};
