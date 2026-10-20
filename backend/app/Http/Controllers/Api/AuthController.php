<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

/**
 * Prisijungimas (Sanctum API žetonai).
 * POST /api/login {username, password} -> {token, user}
 */
class AuthController extends Controller
{
    /** Žetono galiojimas valandomis (po to - prisijungti iš naujo). */
    private const TOKEN_HOURS = 12;

    /** Nepavykę bandymai vienam vartotojui+IP, po kurių blokuojama 15 min. */
    private const MAX_ATTEMPTS = 5;

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string|max:50',
            'password' => 'required|string|max:255',
        ]);

        $key = 'login:'.Str::lower($data['username']).'|'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            $minutes = (int) ceil(RateLimiter::availableIn($key) / 60);
            throw ValidationException::withMessages([
                'username' => "Per daug nepavykusių bandymų. Bandykite po {$minutes} min.",
            ])->status(429);
        }

        $user = User::where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 15 * 60);
            throw ValidationException::withMessages(['username' => 'Neteisingas vartotojo vardas arba slaptažodis.']);
        }

        RateLimiter::clear($key);
        // seni nebegaliojantys žetonai nekaupiami
        $user->tokens()->where('expires_at', '<', now())->delete();

        return [
            'token' => $user->createToken('spa', ['*'], now()->addHours(self::TOKEN_HOURS))->plainTextToken,
            'user'  => $user,
        ];
    }

    public function me(Request $request)
    {
        return $request->user();
    }

    /** Slaptažodžio keitimas. Kiti to vartotojo prisijungimai (žetonai) panaikinami. */
    public function changePassword(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => 'required|string',
            'password'         => ['required', 'string', 'confirmed', 'different:current_password', Password::min(8)->letters()->numbers()],
        ], [
            'password.confirmed' => 'Slaptažodžiai nesutampa.',
            'password.different' => 'Naujas slaptažodis turi skirtis nuo dabartinio.',
            'password.min'       => 'Slaptažodis turi būti bent 8 simbolių.',
            'password.letters'   => 'Slaptažodyje turi būti raidžių.',
            'password.numbers'   => 'Slaptažodyje turi būti skaičių.',
        ]);

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => 'Neteisingas dabartinis slaptažodis.']);
        }
        if (Str::lower($data['password']) === Str::lower($user->username)) {
            throw ValidationException::withMessages(['password' => 'Slaptažodis negali sutapti su vartotojo vardu.']);
        }

        $user->forceFill(['password' => $data['password'], 'must_change_password' => false])->save();
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();

        return $user->fresh();
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
