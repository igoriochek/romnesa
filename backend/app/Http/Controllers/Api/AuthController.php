<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Prisijungimas (Sanctum API žetonai).
 * POST /api/login {username, password} -> {token, user}
 */
class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['username' => 'Neteisingas vartotojo vardas arba slaptažodis.']);
        }

        return [
            'token' => $user->createToken('spa')->plainTextToken,
            'user'  => $user,
        ];
    }

    public function me(Request $request)
    {
        return $request->user();
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
