<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialBatch;
use App\Models\MaterialOutflow;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Žaliavų perdavimai/nurašymai (Excel "5 Žaliavų perdavimai").
 * Negalima perduoti daugiau nei partijos likutis. Nurašymui privaloma priežastis.
 */
class OutflowController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    public function index(Request $request)
    {
        return MaterialOutflow::with(['materialBatch.rawMaterial', 'writeoffAct:id,act_number'])
            ->when($request->query('type'), fn ($q, $type) => $q->where('outflow_type', $type))
            ->when($request->boolean('unassigned'), fn ($q) => $q->whereNull('writeoff_act_id'))
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
            'reason'            => ['nullable', 'required_if:outflow_type,writeoff', Rule::in(array_keys(MaterialOutflow::REASONS))],
            'destination'       => 'nullable|string|max:150',
            'document_number'   => 'nullable|string|max:50',
            'notes'             => 'nullable|string|max:255',
        ], [
            'reason.required_if' => 'Nurašymui privaloma nurodyti priežastį.',
        ]);

        if ($data['outflow_type'] === 'transfer') {
            $data['reason'] = null;
        }

        $batch = MaterialBatch::findOrFail($data['material_batch_id']);

        if ($batch->is_locked) {
            return response()->json(['message' => 'Partija įspajamota (užrakinta) – perdavimas draudžiamas.'], 423);
        }

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

    /** Įspajamojimas: užrakintas įrašas nebenaikinamas. */
    public function lock(int $id)
    {
        return MaterialOutflow::findOrFail($id)->toggleLock();
    }

    public function destroy(int $id)
    {
        $outflow = MaterialOutflow::with('writeoffAct')->findOrFail($id);
        if ($outflow->is_locked) {
            return response()->json(['message' => 'Įrašas įspajamotas (užrakintas) – naikinti negalima.'], 423);
        }
        if ($outflow->writeoffAct) {
            return response()->json(['message' => "Įrašas įtrauktas į nurašymo aktą {$outflow->writeoffAct->act_number} – pirma pašalinkite aktą."], 422);
        }
        $outflow->delete();
        return response()->noContent();
    }
}
