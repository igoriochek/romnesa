<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class ProductMovement extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'movement_date' => 'date',
        'is_locked' => 'boolean',
    ];

    public function lWeek()
    {
        return $this->belongsTo(LWeek::class);
    }

    public function packedProduct()
    {
        return $this->belongsTo(PackedProduct::class);
    }

    public function warehouseFrom()
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_from_id');
    }

    public function warehouseTo()
    {
        return $this->belongsTo(Warehouse::class, 'warehouse_to_id');
    }

    public function shop()
    {
        return $this->belongsTo(Shop::class);
    }
}
