<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Recipe extends Model
{
    protected $guarded = ['id'];

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    public function items()
    {
        return $this->hasMany(RecipeItem::class);
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }
}
