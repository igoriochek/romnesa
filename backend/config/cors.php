<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    | Kada naudoti: dev metu frontend (localhost:5173) -> API (localhost:8080).
    | Serveryje, kai viskas tame pačiame origin, nereikia - naudokite
    | konkrečias reikšmes: CORS_ALLOWED_ORIGINS=https://romnesa.lt
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', '*'))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
