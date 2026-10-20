<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Kol vartotojas nepakeitė numatytojo slaptažodžio - leidžiama tik
 * sužinoti save, pakeisti slaptažodį ir atsijungti.
 */
class EnsurePasswordChanged
{
    private const ALLOWED = ['api/user', 'api/change-password', 'api/logout'];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->must_change_password && ! $request->is(...self::ALLOWED)) {
            return response()->json([
                'message' => 'Prieš tęsiant būtina pakeisti slaptažodį.',
                'code'    => 'password_change_required',
            ], 403);
        }

        return $next($request);
    }
}
