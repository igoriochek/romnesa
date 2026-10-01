<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PackedProduct extends Model
{
    protected $guarded = ['id'];

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    public function movements()
    {
        return $this->hasMany(ProductMovement::class);
    }
}
