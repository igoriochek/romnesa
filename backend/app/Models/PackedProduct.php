<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PackedProduct extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    /** Pakavimo specifikacija (medžiagos 1 vnt.). */
    public function specs()
    {
        return $this->hasMany(PackingSpec::class)->orderBy('sort_order')->orderBy('id');
    }

    public function movements()
    {
        return $this->hasMany(ProductMovement::class);
    }
}
