<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

/**
 * Registracijų istorija („istorija turi likti ir rodyti viską").
 * GET /api/history?entity=Production&action=created
 */
class HistoryController extends Controller
{
    public function index(Request $request)
    {
        return AuditLog::with('user:id,name')
            ->when($request->entity, fn ($q) => $q->where('entity_type', 'like', '%' . $request->entity))
            ->when($request->action, fn ($q) => $q->where('action', $request->action))
            ->when($request->entity_id, fn ($q) => $q->where('entity_id', $request->entity_id))
            ->orderByDesc('id')
            ->paginate(50);
    }
}
