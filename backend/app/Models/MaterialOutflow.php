<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class MaterialOutflow extends Model
{
    use Auditable;

    /** Nurašymo priežasčių kodai (privaloma nurašymui). */
    public const REASONS = [
        'expired'   => 'Pasibaigęs galiojimas',
        'damaged'   => 'Sugadinta / nekokybiška',
        'inventory' => 'Inventorizacijos skirtumas',
        'other'     => 'Kita',
    ];

    protected $guarded = ['id'];

    protected $casts = [
        'outflow_date' => 'date',
        'is_locked' => 'boolean',
    ];

    protected $appends = ['value_eur'];

    public function materialBatch()
    {
        return $this->belongsTo(MaterialBatch::class);
    }

    public function writeoffAct()
    {
        return $this->belongsTo(WriteoffAct::class);
    }

    /** Vertė pagal partijos savikainą (null - kaina nenurodyta arba partija neužkrauta). */
    public function getValueEurAttribute(): ?float
    {
        if (! $this->relationLoaded('materialBatch')) {
            return null;
        }
        $unit = $this->materialBatch?->unit_cost_eur;

        return $unit === null ? null : round((float) $this->qty_kg * (float) $unit, 2);
    }
}
