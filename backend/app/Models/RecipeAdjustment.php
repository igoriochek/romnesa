<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Mėnesio sunaudojimo korekcija: vienos žaliavos norma tik nurodyto laikotarpio gamyboms. */
class RecipeAdjustment extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'valid_from' => 'date:Y-m-d',
        'valid_to' => 'date:Y-m-d',
        'is_locked' => 'boolean',
    ];

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    public function rawMaterial()
    {
        return $this->belongsTo(RawMaterial::class);
    }
}
