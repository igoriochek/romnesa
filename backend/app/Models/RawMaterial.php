<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RawMaterial extends Model
{
    protected $guarded = ['id'];

    public function batches()
    {
        return $this->hasMany(MaterialBatch::class);
    }
}
