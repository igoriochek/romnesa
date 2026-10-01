<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductionProduct extends Model
{
    protected $guarded = ['id'];

    public function packedProducts()
    {
        return $this->hasMany(PackedProduct::class);
    }

    public function recipes()
    {
        return $this->hasMany(Recipe::class);
    }

    public function productions()
    {
        return $this->hasMany(Production::class);
    }
}
