<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Pakavimo specifikacija: kiek medžiagos reikia 1 supakuotam vnt. */
class PackingSpec extends Model
{
    protected $guarded = ['id'];

    public function packedProduct()
    {
        return $this->belongsTo(PackedProduct::class);
    }

    public function packagingMaterial()
    {
        return $this->belongsTo(PackagingMaterial::class);
    }
}
