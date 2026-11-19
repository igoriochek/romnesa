<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WorkOperation extends Model
{
    protected $guarded = ['id'];

    protected $casts = ['is_active' => 'boolean', 'norm_kg' => 'float'];
}
