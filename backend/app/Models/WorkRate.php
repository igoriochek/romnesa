<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkRate extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'valid_from' => 'date:Y-m-d',
        'valid_to' => 'date:Y-m-d',
        'rate' => 'float',
        'rate_2nd' => 'float',
    ];

    public function operation()
    {
        return $this->belongsTo(WorkOperation::class, 'work_operation_id');
    }

    public function worker()
    {
        return $this->belongsTo(Worker::class);
    }
}
