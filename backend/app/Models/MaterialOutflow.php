<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MaterialOutflow extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'outflow_date' => 'date',
    ];

    public function materialBatch()
    {
        return $this->belongsTo(MaterialBatch::class);
    }
}
