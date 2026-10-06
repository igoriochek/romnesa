<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialBatch;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;

/**
 * Žaliavų partijos (Excel "1 Žaliavų gavimas").
 * index grąžina ir likutį + dienas iki galiojimo ("6 Partijų likučiai").
 */
class MaterialBatchController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    public function index(Request $request)
    {
        $batches = MaterialBatch::with('rawMaterial')
            ->orderBy('expiry_date')
            ->orderByDesc('id')
            ->paginate(50);

        $batches->getCollection()->transform(function ($b) {
            $b->balance_kg = $this->stock->batchBalance($b);
            $b->days_to_expiry = (int) now()->diffInDays($b->expiry_date, false);
            return $b;
        });

        return $batches;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'received_date'    => 'required|date',
            'raw_material_id'  => 'required|exists:raw_materials,id',
            'batch_number'     => 'required|string|max:50|unique:material_batches,batch_number',
            'qty_received_kg'  => 'required|numeric|gt:0',
            'supplier'         => 'nullable|string|max:150',
            'invoice_number'   => 'nullable|string|max:50',
            'expiry_date'      => 'required|date|after:received_date',
            'notes'            => 'nullable|string|max:255',
        ]);

        $data['created_by_id'] = $request->user()?->id;

        return response()->json(MaterialBatch::create($data), 201);
    }

    public function show(int $id)
    {
        $batch = MaterialBatch::with([
            'rawMaterial',
            'usages.production.productionProduct',
            'usages.production.lWeek',
            'outflows',
        ])->findOrFail($id);

        $batch->balance_kg = $this->stock->batchBalance($batch);
        $batch->days_to_expiry = (int) now()->diffInDays($batch->expiry_date, false);

        return $batch;
    }

    /** Įspajamojimas: užrakinta partija negali būti naikinama ar perduodama. */
    public function lock(int $id)
    {
        $batch = MaterialBatch::findOrFail($id);
        $batch->update(['is_locked' => ! $batch->is_locked]);
        $batch->logAudit($batch->is_locked ? 'locked' : 'unlocked');
        return $batch;
    }

    public function destroy(int $id)
    {
        $batch = MaterialBatch::findOrFail($id);
        if ($batch->is_locked) {
            return response()->json(['message' => 'Partija įspajamota (užrakinta) – naikinti negalima.'], 423);
        }
        if ($batch->usages()->exists() || $batch->outflows()->exists()) {
            return response()->json(['message' => 'Partija panaudota gamyboje/perdavimuose – naikinti negalima, tik nurašyti likutį.'], 422);
        }
        $batch->delete();
        return response()->noContent();
    }
}
