<?php

use Illuminate\Support\Facades\Route;

// React frontend (npm run build -> backend/public/app)
$spa = fn () => file_exists(public_path('app/index.html'))
    ? response()->file(public_path('app/index.html'))
    : 'Romnesa API veikia. Frontend dar nesukompiliuotas - paleiskite `npm run build` kataloge frontend/';

Route::get('/', $spa);

// SPA fallback: visi ne-API keliai atidaro app/index.html
Route::get('/{any}', $spa)
    ->where('any', '^(?!api).*$')
    ->fallback();
