<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

/** Transportinės pakuotės norma: fasavimo rūšis + pirkėjas -> dėžė, talpa, perdengimai. */
class TransportNorm extends Model
{
    use Auditable;

    protected $guarded = ['id'];

    protected $casts = [
        'units_per_box' => 'float',
        'overlays_per_box' => 'float',
    ];

    public function packedProduct()
    {
        return $this->belongsTo(PackedProduct::class);
    }

    public function shop()
    {
        return $this->belongsTo(Shop::class);
    }

    public function boxMaterial()
    {
        return $this->belongsTo(PackagingMaterial::class, 'box_material_id');
    }

    public function overlayMaterial()
    {
        return $this->belongsTo(PackagingMaterial::class, 'overlay_material_id');
    }

    public function auditLabel(): string
    {
        return "Transportinė norma #{$this->id}";
    }
}
