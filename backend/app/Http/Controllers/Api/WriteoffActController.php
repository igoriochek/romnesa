<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MaterialOutflow;
use App\Models\WriteoffAct;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Žaliavų nurašymo aktai: pasirinkti nurašymo įrašai sujungiami į vieną
 * numeruotą dokumentą (spausdinamas / eksportuojamas į PDF).
 */
class WriteoffActController extends Controller
{
    public function index()
    {
        return WriteoffAct::with('outflows.materialBatch')
            ->orderByDesc('act_date')->orderByDesc('id')
            ->get()
            ->map(function ($act) {
                $act->withTotals();
                $act->lines = $act->outflows->count();

                return $act->makeHidden('outflows');
            });
    }

    public function show(int $id)
    {
        $act = WriteoffAct::with('outflows.materialBatch.rawMaterial')->findOrFail($id)->withTotals();
        $act->reasons = MaterialOutflow::REASONS;

        return $act;
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'act_date'      => 'required|date',
            'act_number'    => 'nullable|string|max:30|unique:writeoff_acts,act_number',
            'compiled_by'   => 'nullable|string|max:100',
            'approved_by'   => 'nullable|string|max:100',
            'notes'         => 'nullable|string|max:255',
            'outflow_ids'   => 'required|array|min:1',
            'outflow_ids.*' => 'integer|distinct',
        ], [
            'outflow_ids.required' => 'Pasirinkite bent vieną nurašymo įrašą.',
        ]);

        $outflows = MaterialOutflow::whereIn('id', $data['outflow_ids'])
            ->where('outflow_type', 'writeoff')
            ->whereNull('writeoff_act_id')
            ->get();

        if ($outflows->count() !== count($data['outflow_ids'])) {
            return response()->json(['message' => 'Dalis įrašų nėra nurašymai arba jau įtraukti į kitą aktą.'], 422);
        }

        $act = DB::transaction(function () use ($data, $outflows, $request) {
            $act = WriteoffAct::create([
                'act_number'    => ($data['act_number'] ?? null) ?: $this->nextNumber($data['act_date']),
                'act_date'      => $data['act_date'],
                'compiled_by'   => ($data['compiled_by'] ?? null) ?: $request->user()?->name,
                'approved_by'   => $data['approved_by'] ?? null,
                'notes'         => $data['notes'] ?? null,
                'created_by_id' => $request->user()?->id,
            ]);
            // per Eloquent - kad kiekvienas priskyrimas liktų istorijoje
            $outflows->each(fn ($o) => $o->update([
                'writeoff_act_id' => $act->id,
                'document_number' => $o->document_number ?: $act->act_number,
            ]));

            return $act;
        });

        return response()->json($this->show($act->id), 201);
    }

    public function lock(int $id)
    {
        return WriteoffAct::findOrFail($id)->toggleLock();
    }

    /** Akto pašalinimas: nurašymai lieka, tik atsiejami nuo akto. */
    public function destroy(int $id)
    {
        $act = WriteoffAct::with('outflows')->findOrFail($id);
        if ($act->is_locked) {
            return response()->json(['message' => 'Aktas įspajamotas (užrakintas) – naikinti negalima.'], 423);
        }
        DB::transaction(function () use ($act) {
            $act->outflows->each(fn ($o) => $o->update([
                'writeoff_act_id' => null,
                'document_number' => $o->document_number === $act->act_number ? null : $o->document_number,
            ]));
            $act->delete();
        });

        return response()->noContent();
    }

    /** NA-2026-001: eilės numeris pagal akto metus. */
    private function nextNumber(string $date): string
    {
        $prefix = 'NA-'.substr($date, 0, 4).'-';
        $last = WriteoffAct::where('act_number', 'like', $prefix.'%')->pluck('act_number')
            ->map(fn ($n) => (int) substr($n, strlen($prefix)))->max() ?? 0;

        return $prefix.str_pad((string) ($last + 1), 3, '0', STR_PAD_LEFT);
    }
}
