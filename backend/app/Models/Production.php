<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Production extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'production_date' => 'date',
        'is_locked' => 'boolean',
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
