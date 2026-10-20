<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Žaliavų nurašymo aktas - jungia kelis nurašymo (writeoff) įrašus į vieną dokumentą. */
class WriteoffAct extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'act_date' => 'date',
        'is_locked' => 'boolean',
    ];

    public function auditLabel(): string
    {
        return "Nurašymo aktas {$this->act_number}";
    }

    public function outflows()
    {
        return $this->hasMany(MaterialOutflow::class);
    }

    /** Eilučių sumos: kg ir vertė pagal partijos savikainą (value_complete=false - kuriai nors partijai kaina nenurodyta). */
    public function withTotals(): static
    {
        $this->loadMissing('outflows.materialBatch.rawMaterial');

        $this->total_kg = round($this->outflows->sum(fn ($o) => (float) $o->qty_kg), 3);
        $this->total_value_eur = round($this->outflows->sum(fn ($o) => (float) $o->value_eur), 2);
        $this->value_complete = $this->outflows->every(fn ($o) => $o->value_eur !== null);

        return $this;
    }
}
