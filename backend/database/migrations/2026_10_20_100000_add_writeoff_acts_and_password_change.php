<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nurašymo aktai (aprašas: „atskiras nurašymų registras ir privalomas priežasties kodas"),
     * nurašymo priežastis perdavimo įraše ir privalomas slaptažodžio pakeitimas.
     */
    public function up(): void
    {
        Schema::create('writeoff_acts', function (Blueprint $table) {
            $table->id();
            $table->string('act_number', 30)->unique();
            $table->date('act_date');
            $table->string('compiled_by', 100)->nullable();   // Sudarė
            $table->string('approved_by', 100)->nullable();   // Patvirtino
            $table->string('notes')->nullable();
            $table->boolean('is_locked')->default(false)->index();
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('material_outflows', function (Blueprint $table) {
            $table->string('reason', 20)->nullable()->after('outflow_type');
            $table->foreignId('writeoff_act_id')->nullable()->after('reason')->constrained()->nullOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('must_change_password')->default(false)->after('password');
        });

        // Numatytasis slaptažodis (Admin / admin) - privaloma pakeisti prisijungus
        foreach (DB::table('users')->get(['id', 'password']) as $user) {
            if (Hash::check('admin', $user->password)) {
                DB::table('users')->where('id', $user->id)->update(['must_change_password' => true]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('must_change_password');
        });

        Schema::table('material_outflows', function (Blueprint $table) {
            $table->dropConstrainedForeignId('writeoff_act_id');
            $table->dropColumn('reason');
        });

        Schema::dropIfExists('writeoff_acts');
    }
};
