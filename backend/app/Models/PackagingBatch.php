<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Pakuočių gavimas (partija) - likutis = gauta - sunaudota pakuojant. */
class PackagingBatch extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'received_date' => 'date:Y-m-d',
        'is_locked' => 'boolean',
    ];

    public function packagingMaterial()
    {
        return $this->belongsTo(PackagingMaterial::class);
    }

    public function usages()
    {
        return $this->hasMany(PackingUsage::class);
    }

    public function auditLabel(): string
    {
        return "Pakuočių partija {$this->batch_number}";
    }
}
