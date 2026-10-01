<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaterialBatch extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'received_date' => 'date',
        'expiry_date' => 'date',
    ];

    public function rawMaterial()
    {
        return $this->belongsTo(RawMaterial::class);
    }

    public function usages()
    {
        return $this->hasMany(MaterialUsage::class);
    }

    public function outflows()
    {
        return $this->hasMany(MaterialOutflow::class);
    }
}
