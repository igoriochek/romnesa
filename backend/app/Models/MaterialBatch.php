<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class MaterialBatch extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'received_date' => 'date',
        'expiry_date' => 'date',
        'is_locked' => 'boolean',
    ];

    public function auditLabel(): string
    {
        return "Partija {$this->batch_number}";
    }

    /** Dienos iki galiojimo pabaigos (neigiamos - pasibaigusi). Nuo šiandienos, ne nuo dabartinio laiko. */
    public function daysToExpiry(): int
    {
        return (int) today()->diffInDays($this->expiry_date, false);
    }

    public function rawMaterial()
    {
        return $this->belongsTo(RawMaterial::class);
    }

    public function usages()
    {
        return $this->hasMany(MaterialUsage::class);
    }

    public function outflows()
    {
        return $this->hasMany(MaterialOutflow::class);
    }
}
