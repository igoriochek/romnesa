<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RawMaterial extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'requires_batch' => 'boolean',
        'is_active' => 'boolean',
    ];

    public function batches()
    {
        return $this->hasMany(MaterialBatch::class);
    }
}
