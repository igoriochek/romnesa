<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PackingUsage extends Model
{
    protected $guarded = ['id'];

    public function packing()
    {
        return $this->belongsTo(Packing::class);
    }

    public function packagingMaterial()
    {
        return $this->belongsTo(PackagingMaterial::class);
    }

    public function packagingBatch()
    {
        return $this->belongsTo(PackagingBatch::class);
    }
}
