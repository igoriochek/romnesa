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

    /**
     * Žaliavų savikaina: Σ sunaudota kg × partijos €/kg.
     * cost_complete=false, kai kuriai sunaudotai partijai nenurodyta savikaina arba partijos trūksta
     * (žaliavos be privalomos partijos, pvz. vanduo, skaičiuojamos 0 €).
     */
    public function withCost(): static
    {
        $this->loadMissing('usages.materialBatch', 'usages.rawMaterial');

        $cost = 0.0;
        $complete = true;
        foreach ($this->usages as $u) {
            $unit = $u->materialBatch?->unit_cost_eur;
            if ($unit !== null) {
                $cost += (float) $u->qty_kg * (float) $unit;
            } elseif ($u->materialBatch || $u->rawMaterial?->requires_batch !== false) {
                $complete = false;
            }
        }

        $this->cost_eur = round($cost, 2);
        $this->cost_per_kg_eur = (float) $this->qty_produced_kg > 0 ? round($cost / (float) $this->qty_produced_kg, 4) : null;
        $this->cost_complete = $complete;

        return $this;
    }
}
