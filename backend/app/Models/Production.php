<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Production extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'production_date' => 'date',
    ];

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    public function lWeek()
    {
        return $this->belongsTo(LWeek::class);
    }

    public function recipe()
    {
        return $this->belongsTo(Recipe::class);
    }

    public function usages()
    {
        return $this->hasMany(MaterialUsage::class);
    }
}
