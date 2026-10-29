<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialBatch;
use App\Services\MaterialStockService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Žaliavų partijos (Excel "1 Žaliavų gavimas").
 * index grąžina ir likutį + dienas iki galiojimo ("6 Partijų likučiai").
 */
class MaterialBatchController extends Controller
{
    public function __construct(private MaterialStockService $stock) {}

    public function index(Request $request)
    {
        // Partijų puslapis filtruoja naršyklėje, todėl gali paprašyti daugiau nei vieno puslapio
        $perPage = min(max((int) $request->query('per_page', 50), 1), 1000);

        $batches = MaterialStockService::withSums(MaterialBatch::with(['rawMaterial', 'warehouse']))
            ->orderBy('expiry_date')
            ->orderByDesc('id')
            ->paginate($perPage);

        $batches->getCollection()->transform(fn ($b) => $this->stock->withTotals($b));

        return $batches;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'received_date'    => 'required|date',
            'raw_material_id'  => 'required|exists:raw_materials,id',
            'warehouse_id'     => 'nullable|exists:warehouses,id',
            'batch_number'     => 'required|string|max:50|unique:material_batches,batch_number',
            'qty_received_kg'  => 'required|numeric|gt:0',
            'unit_cost_eur'    => 'nullable|numeric|min:0',
            'supplier'         => 'nullable|string|max:150',
            'invoice_number'   => 'nullable|string|max:50',
            'expiry_date'      => 'required|date|after:received_date',
            'notes'            => 'nullable|string|max:255',
        ]);

        $data['created_by_id'] = $request->user()?->id;

        return response()->json(MaterialBatch::create($data)->load(['rawMaterial', 'warehouse']), 201);
    }

    /**
     * Esamos partijos taisymas (pvz. vėliau įvesta savikaina). Užrakintos - netaisomos.
     * Panaudotai partijai negalima keisti žaliavos, o kiekis negali būti mažesnis už jau sunaudotą + perduotą.
     */
    public function update(Request $request, int $id)
    {
        $batch = MaterialBatch::findOrFail($id);
        if ($batch->is_locked) {
            return response()->json(['message' => 'Partija įspajamota (užrakinta) – taisyti negalima.'], 423);
        }

        $data = $request->validate([
            'received_date'    => 'sometimes|required|date',
            'raw_material_id'  => 'sometimes|required|exists:raw_materials,id',
            'warehouse_id'     => 'nullable|exists:warehouses,id',
            'batch_number'     => "sometimes|required|string|max:50|unique:material_batches,batch_number,{$batch->id}",
            'qty_received_kg'  => 'sometimes|required|numeric|gt:0',
            'unit_cost_eur'    => 'nullable|numeric|min:0',
            'supplier'         => 'nullable|string|max:150',
            'invoice_number'   => 'nullable|string|max:50',
            'expiry_date'      => 'sometimes|required|date',
            'notes'            => 'nullable|string|max:255',
        ]);

        $received = Carbon::parse($data['received_date'] ?? $batch->received_date)->startOfDay();
        $expiry = Carbon::parse($data['expiry_date'] ?? $batch->expiry_date)->startOfDay();
        if ($expiry->lte($received)) {
            return response()->json(['message' => 'Galiojimo data turi būti vėlesnė už gavimo datą.'], 422);
        }

        $totals = $this->stock->batchTotals($batch);
        $consumed = round($totals['used_kg'] + $totals['outflow_kg'], 3);
        $inUse = $consumed > 0;

        if ($inUse && isset($data['raw_material_id']) && (int) $data['raw_material_id'] !== $batch->raw_material_id) {
            return response()->json(['message' => 'Partija jau panaudota – žaliavos keisti negalima.'], 422);
        }
        if (isset($data['qty_received_kg']) && $data['qty_received_kg'] < $consumed) {
            return response()->json(['message' => "Kiekis negali būti mažesnis už jau sunaudotą ir perduotą ({$consumed} kg)."], 422);
        }
        // Panaudotos partijos datos negali prieštarauti jau užfiksuotam sunaudojimui (gauta iki, galioja per gamybą)
        if ($inUse) {
            $firstUse = collect([
                $batch->usages()->join('productions', 'productions.id', '=', 'material_usages.production_id')->min('productions.production_date'),
                $batch->outflows()->min('outflow_date'),
            ])->filter()->min();
            $lastProduction = $batch->usages()->join('productions', 'productions.id', '=', 'material_usages.production_id')->max('productions.production_date');
            if ($firstUse && $received->gt(Carbon::parse($firstUse))) {
                return response()->json(['message' => 'Gavimo data negali būti vėlesnė už pirmą partijos panaudojimą ('.Carbon::parse($firstUse)->toDateString().').'], 422);
            }
            if ($lastProduction && $expiry->lt(Carbon::parse($lastProduction))) {
                return response()->json(['message' => 'Galiojimo data negali būti ankstesnė už paskutinę gamybą iš šios partijos ('.Carbon::parse($lastProduction)->toDateString().').'], 422);
            }
        }

        $batch->update($data);

        return $this->stock->withTotals($batch->load(['rawMaterial', 'warehouse']));
    }

    public function show(int $id)
    {
        $batch = MaterialBatch::with([
            'rawMaterial',
            'warehouse',
            'usages.production.productionProduct',
            'usages.production.lWeek',
            'outflows',
        ])->findOrFail($id);

        return $this->stock->withTotals($batch);
    }

    /** Įspajamojimas: užrakinta partija negali būti naikinama ar perduodama. */
    public function lock(int $id)
    {
        return MaterialBatch::findOrFail($id)->toggleLock();
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
