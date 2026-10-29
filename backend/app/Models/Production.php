<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Services\CostService;
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

    /**
     * Žaliavų savikaina (žr. CostService): faktinė pagal partijų kainas + įvertinta dalis,
     * kur kaina dar neįvesta. $details - ir struktūra pagal žaliavas (cost_materials).
     */
    public function withCost(bool $details = false): static
    {
        $cost = app(CostService::class)->production($this);
        if (! $details) {
            unset($cost['cost_materials']);
        }
        foreach ($cost as $key => $value) {
            $this->{$key} = $value;
        }

        return $this;
    }
}
