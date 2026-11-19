<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Pakuotų šakočių registravimas (sukuria ir fasavimo papildymo judėjimą). */
class Packing extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'packing_date' => 'date:Y-m-d',
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

    public function warehouse()
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function movement()
    {
        return $this->belongsTo(ProductMovement::class, 'product_movement_id');
    }

    public function shop()
    {
        return $this->belongsTo(Shop::class);
    }

    public function sourcePackedProduct()
    {
        return $this->belongsTo(PackedProduct::class, "source_packed_product_id");
    }

    public function sourceWarehouse()
    {
        return $this->belongsTo(Warehouse::class, "source_warehouse_id");
    }

    public function sourceMovement()
    {
        return $this->belongsTo(ProductMovement::class, "source_movement_id");
    }

    public function usages()
    {
        return $this->hasMany(PackingUsage::class);
    }

    public function auditLabel(): string
    {
        return "Pakavimas #{$this->id}";
    }
}
