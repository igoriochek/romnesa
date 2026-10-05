<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialBatch;
use App\Models\MaterialOutflow;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;

/**
 * Žaliavų perdavimai/nurašymai (Excel "5 Žaliavų perdavimai").
 * Negalima perduoti daugiau nei partijos likutis.
 */
class OutflowController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    public function index()
    {
        return MaterialOutflow::with('materialBatch.rawMaterial')
            ->orderByDesc('outflow_date')
            ->orderByDesc('id')
            ->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'outflow_date'      => 'required|date',
            'material_batch_id' => 'required|exists:material_batches,id',
            'qty_kg'            => 'required|numeric|gt:0',
            'outflow_type'      => 'required|in:transfer,writeoff',
            'destination'       => 'nullable|string|max:150',
            'document_number'   => 'nullable|string|max:50',
            'notes'             => 'nullable|string|max:255',
        ]);

        $batch = MaterialBatch::findOrFail($data['material_batch_id']);
        $balance = $this->stock->batchBalance($batch);

        if ($data['qty_kg'] > $balance) {
            return response()->json([
                'message' => "Partijos likutis nepakankamas (liko {$balance} kg).",
                'balance_kg' => $balance,
            ], 422);
        }

        $data['created_by_id'] = $request->user()?->id;

        return response()->json(
            MaterialOutflow::create($data)->load('materialBatch.rawMaterial'),
            201
        );
    }
}
