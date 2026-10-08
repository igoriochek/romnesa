<?php

namespace App\Providers;

use App\Models\AuditLog;
use App\Support\Audit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Pilna registracijų istorija visoms lentelėms (App\Models\*).
        // Wildcard listeneriai gauna (string $event, array $payload) - modelis yra $payload[0].
        $audit = function (string $event, array $payload): void {
            /** @var Model $model */
            $model = $payload[0];
            if ($model instanceof AuditLog) {
                return;
            }
            $action = match (true) {
                str_contains($event, '.created:') => 'created',
                str_contains($event, '.updated:') => 'updated',
                str_contains($event, '.deleted:') => 'deleted',
                default => null,
            };
            if (! $action) {
                return;
            }
            $data = match ($action) {
                'created' => $model->getAttributes(),
                // naujos reikšmės + _old: buvusios (updated įvykio metu original dar nesinchronizuotas)
                'updated' => [
                    ...$model->getChanges(),
                    '_old' => array_intersect_key($model->getRawOriginal(), $model->getChanges()),
                ],
                'deleted' => ['deleted' => $model->getOriginal()],
            };
            Audit::write($model, $action, $data);
        };

        Event::listen('eloquent.created: App\Models\*', $audit);
        Event::listen('eloquent.updated: App\Models\*', $audit);
        Event::listen('eloquent.deleted: App\Models\*', $audit);
    }
}
