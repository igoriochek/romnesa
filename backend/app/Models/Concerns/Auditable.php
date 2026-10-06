<?php

namespace App\Models\Concerns;

use App\Support\Audit;

/**
 * Rankiniai istorijos įrašai (pvz. „locked") ir etiketė istorijai.
 * created/updated/deleted fiksuojami globaliai per wildcard listenerius
 * (AppServiceProvider) - čia nereikia bootAuditable(), būtų dvigubas žurnalas.
 */
trait Auditable
{
    /** Žmogui skaitoma etiketė istorijai - modelis gali perrašyti. */
    public function auditLabel(): string
    {
        return sprintf('%s #%s', class_basename($this), $this->getKey());
    }

    /** Rankinis įrašas, pvz. „locked"/„unlocked". */
    public function logAudit(string $action, ?array $payload = null): void
    {
        Audit::write($this, $action, $payload);
    }
}
