<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

/**
 * Vienintelė vieta istorijos įrašams (sukūrimas/keitimas/naikinimas/uzraktas).
 * Auto-jungiamas visiems App\Models\* modeliams per wildcard listenerius
 * (žr. AppServiceProvider), rankinis - Audit::write($model, 'locked').
 */
class Audit
{
    public static function write(Model $model, string $action, ?array $payload = null): void
    {
        AuditLog::create([
            'entity_type' => get_class($model),
            'entity_id'   => $model->getKey(),
            'action'      => $action,
            'label'       => self::label($model),
            'payload'     => $payload,
            'user_id'     => auth()->id(),
        ]);
    }

    /** Žmogui skaitoma etiketė: „Partija Mil0630", „Sandėlis Fasavimo sandėlys", „Gamyba #3". */
    public static function label(Model $model): string
    {
        if (method_exists($model, 'auditLabel')) {
            return $model->auditLabel();
        }

        $name = class_basename($model);
        $key = $model->getAttribute('batch_number')
            ?? $model->getAttribute('code')
            ?? $model->getAttribute('name');

        return $key ? "{$name} {$key}" : "{$name} #{$model->getKey()}";
    }
}
