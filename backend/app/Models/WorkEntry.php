<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Darbo lapo įrašas. Patvirtinus (is_locked) įkainis ir suma užfiksuojami. */
class WorkEntry extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'work_date' => 'date:Y-m-d',
        'details' => 'array',
        'is_locked' => 'boolean',
        'approved_at' => 'datetime',
        'qty' => 'float',
        'hours' => 'float',
        'rate_applied' => 'float',
        'amount' => 'float',
    ];

    public function worker()
    {
        return $this->belongsTo(Worker::class);
    }

    public function operation()
    {
        return $this->belongsTo(WorkOperation::class, 'work_operation_id');
    }

    public function productionProduct()
    {
        return $this->belongsTo(ProductionProduct::class);
    }

    public function lWeek()
    {
        return $this->belongsTo(LWeek::class);
    }
}
