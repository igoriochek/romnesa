<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Pakavimo medžiaga (maišelis, dėžutė, padėlis, rafija, transportinė dėžė). */
class PackagingMaterial extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['is_active' => 'boolean', 'pack_qty' => 'float'];

    public function batches()
    {
        return $this->hasMany(PackagingBatch::class);
    }
}
