<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Prisijungimas vartotojo vardu (ne el. paštu). Pradinis vartotojas: Admin / admin.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username', 50)->nullable()->unique()->after('name');
        });

        $admin = DB::table('users')->where('role', 'admin')->orderBy('id')->first();
        $values = ['username' => 'Admin', 'password' => Hash::make('admin'), 'updated_at' => now()];

        if ($admin) {
            DB::table('users')->where('id', $admin->id)->update($values);
        } else {
            DB::table('users')->insert($values + [
                'name' => 'Admin',
                'email' => 'admin@romnesa.lt',
                'role' => 'admin',
                'created_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['username']);
            $table->dropColumn('username');
        });
    }
};
