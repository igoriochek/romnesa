<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class MaterialOutflow extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'outflow_date' => 'date',
        'is_locked' => 'boolean',
    ];

    public function materialBatch()
    {
        return $this->belongsTo(MaterialBatch::class);
    }
}
