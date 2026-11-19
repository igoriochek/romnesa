<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Production;
use App\Models\WorkEntry;
use App\Models\Worker;
use App\Models\WorkOperation;
use App\Models\WorkRate;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Darbo užmokesčio (DU) apskaita pagal „Šakočių DU" ir „Kulinarinio cecho DU" aprašus.
 *  - darbuotojai, darbai (operacijos) su apmokėjimo pagrindu: valandos arba kiekis;
 *  - įkainiai su galiojimo datomis (bendri arba konkrečiam darbuotojui);
 *  - darbo lapų įrašai: suma = valandos × tarifas arba įskaitytas kiekis × įkainis;
 *  - patvirtinus įrašą įkainis ir suma užfiksuojami - vėliau pakeistas įkainis jo nebeperrašo.
 * Gamybos kiekiai (kg, kibirėliai, maišymai) saugomi kontrolei; algai naudojamas tik apmokamas pagrindas.
 */
class PayrollController extends Controller
{
    private const WORKSHOPS = 'sakociai,kulinarija';

    // ---------- Darbuotojai ----------

    public function workers()
    {
        return Worker::orderBy('workshop')->orderBy('sort_order')->orderBy('name')->get();
    }

    public function storeWorker(Request $request)
    {
        return response()->json(Worker::create($this->workerData($request)), 201);
    }

    public function updateWorker(Request $request, int $id)
    {
        $w = Worker::findOrFail($id);
        $w->update($this->workerData($request));

        return $w;
    }

    public function destroyWorker(int $id)
    {
        $w = Worker::findOrFail($id);
        if (WorkEntry::where('worker_id', $id)->exists()) {
            return response()->json(['message' => 'Darbuotojas turi darbo įrašų – vietoj trynimo pažymėkite „Nebedirba“.'], 422);
        }
        $w->delete();

        return response()->noContent();
    }

    private function workerData(Request $request): array
    {
        return $request->validate([
            'name'      => 'required|string|max:100',
            'position'  => 'nullable|string|max:100',
            'workshop'  => 'required|in:'.self::WORKSHOPS,
            'is_active' => 'boolean',
        ]);
    }

    // ---------- Darbai (operacijos) ----------

    public function operations()
    {
        return WorkOperation::orderBy('workshop')->orderBy('sort_order')->orderBy('name')->get();
    }

    public function storeOperation(Request $request)
    {
        $d = $this->operationData($request);
        $d['sort_order'] = (int) WorkOperation::max('sort_order') + 1;

        return response()->json(WorkOperation::create($d), 201);
    }

    public function updateOperation(Request $request, int $id)
    {
        $op = WorkOperation::findOrFail($id);
        $d = $this->operationData($request);
        if ($d['pay_basis'] !== $op->pay_basis && WorkEntry::where('work_operation_id', $id)->exists()) {
            return response()->json(['message' => 'Darbas jau turi įrašų – apmokėjimo pagrindo keisti negalima. Sukurkite naują darbą.'], 422);
        }
        $op->update($d);

        return $op;
    }

    public function destroyOperation(int $id)
    {
        $op = WorkOperation::findOrFail($id);
        if (WorkEntry::where('work_operation_id', $id)->exists()) {
            return response()->json(['message' => 'Darbas turi įrašų – vietoj trynimo pažymėkite jį neaktyviu.'], 422);
        }
        $op->delete();

        return response()->noContent();
    }

    private function operationData(Request $request): array
    {
        return $request->validate([
            'workshop'  => 'required|in:'.self::WORKSHOPS,
            'stage'     => 'required|in:eggs,mixing,baking,packing,barcoding,other',
            'name'      => 'required|string|max:100',
            'pay_basis' => 'required|in:hours,qty',
            'unit'      => 'required|in:val,vnt,kg,m,t',
            'norm_kg'   => 'nullable|numeric|gt:0|max:1000',
            'is_active' => 'boolean',
        ]);
    }

    // ---------- Įkainiai ----------

    public function rates()
    {
        return WorkRate::with(['operation', 'worker'])
            ->orderBy('work_operation_id')->orderByDesc('valid_from')->get();
    }

    public function storeRate(Request $request)
    {
        $d = $this->rateData($request);
        $this->checkRateOverlap($d);

        return response()->json(WorkRate::create($d)->load(['operation', 'worker']), 201);
    }

    public function updateRate(Request $request, int $id)
    {
        $r = WorkRate::findOrFail($id);
        $d = $this->rateData($request);
        $this->checkRateOverlap($d, $id);
        $r->update($d);

        return $r->load(['operation', 'worker']);
    }

    public function destroyRate(int $id)
    {
        WorkRate::findOrFail($id)->delete();

        return response()->noContent();
    }

    private function rateData(Request $request): array
    {
        return $request->validate([
            'work_operation_id' => 'required|exists:work_operations,id',
            'worker_id'         => 'nullable|exists:workers,id',
            'rate'              => 'required|numeric|min:0|max:100000',
            'rate_2nd'          => 'nullable|numeric|min:0|max:100000',
            'valid_from'        => 'required|date',
            'valid_to'          => 'nullable|date|after_or_equal:valid_from',
            'notes'             => 'nullable|string|max:255',
        ]);
    }

    /** Tam pačiam darbui (ir darbuotojui) negali galioti du įkainiai vienu metu. */
    private function checkRateOverlap(array $d, ?int $ignoreId = null): void
    {
        $to = $d['valid_to'] ?? '9999-12-31';
        $exists = WorkRate::where('work_operation_id', $d['work_operation_id'])
            ->where(fn ($q) => ($d['worker_id'] ?? null) ? $q->where('worker_id', $d['worker_id']) : $q->whereNull('worker_id'))
            ->where('valid_from', '<=', $to)
            ->where(fn ($q) => $q->whereNull('valid_to')->orWhere('valid_to', '>=', $d['valid_from']))
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
        if ($exists) {
            throw ValidationException::withMessages([
                'valid_from' => 'Šiam darbui tuo laikotarpiu įkainis jau galioja. Ankstesniam įkainiui nurodykite „Galioja iki“ datą.',
            ]);
        }
    }

    /** Galiojantis įkainis: darbuotojo asmeninis > bendras; tą dieną galiojantis. */
    private function rateFor(Collection $rates, WorkEntry $e): ?WorkRate
    {
        $date = $e->work_date->toDateString();

        return $rates->get($e->work_operation_id, collect())
            ->filter(fn ($r) => $r->valid_from->toDateString() <= $date && (! $r->valid_to || $r->valid_to->toDateString() >= $date))
            ->filter(fn ($r) => $r->worker_id === null || $r->worker_id === $e->worker_id)
            ->sortBy(fn ($r) => [$r->worker_id === null ? 1 : 0, -$r->valid_from->timestamp])
            ->first();
    }

    // ---------- Darbo lapai ----------

    public function entries(Request $request)
    {
        $f = $request->validate([
            'from'      => 'nullable|date',
            'to'        => 'nullable|date',
            'worker_id' => 'nullable|integer',
            'workshop'  => 'nullable|in:'.self::WORKSHOPS,
        ]);

        return $this->computed($this->query($f)->get());
    }

    private function query(array $f)
    {
        return WorkEntry::with(['worker', 'operation', 'productionProduct', 'lWeek'])
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('work_date', '>=', $d))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('work_date', '<=', $d))
            ->when($f['worker_id'] ?? null, fn ($q, $id) => $q->where('worker_id', $id))
            ->when($f['workshop'] ?? null, fn ($q, $w) => $q->whereHas('operation', fn ($o) => $o->where('workshop', $w)))
            ->orderByDesc('work_date')->orderByDesc('id');
    }

    /**
     * Neužfiksuotiems įrašams suma skaičiuojama pagal tą dieną galiojantį įkainį;
     * patvirtintiems - užfiksuota. Pridedami įspėjimai (nėra įkainio, dublis, įskaityta daugiau nei pagaminta).
     */
    private function computed(Collection $entries): Collection
    {
        $rates = WorkRate::whereIn('work_operation_id', $entries->pluck('work_operation_id')->unique())->get()->groupBy('work_operation_id');

        $dupKey = fn ($e) => implode('|', [$e->work_date->toDateString(), $e->worker_id, $e->work_operation_id, $e->production_product_id, $e->shift]);
        $dups = $entries->groupBy($dupKey)->filter(fn ($g) => $g->count() > 1)->keys()->flip();

        // kepimas pagal rūšį: įskaitytų kg suma per dieną negali viršyti pagamintų kg
        $baked = $entries->filter(fn ($e) => $e->operation->stage === 'baking' && $e->operation->workshop === 'sakociai' && $e->production_product_id)
            ->groupBy(fn ($e) => $e->work_date->toDateString().'|'.$e->production_product_id)
            ->map(fn ($g) => $g->sum('qty'));
        $produced = $baked->isEmpty() ? collect() : Production::query()
            ->whereIn('production_date', $baked->keys()->map(fn ($k) => explode('|', $k)[0])->unique())
            ->selectRaw('production_date, production_product_id, SUM(qty_produced_kg) as kg')
            ->groupBy('production_date', 'production_product_id')->get()
            ->mapWithKeys(fn ($r) => [substr((string) $r->production_date, 0, 10).'|'.$r->production_product_id => (float) $r->kg]);

        return $entries->map(function (WorkEntry $e) use ($rates, $dups, $dupKey, $baked, $produced) {
            $warnings = [];
            if (! $e->is_locked) {
                $rate = $this->rateFor($rates, $e);
                $e->rate_applied = $rate?->rate;
                $e->amount = $rate ? $this->amountFor($e, $rate->rate, $rate->rate_2nd) : null;
                if ($rate && $this->defectKg($e) > 0 && $rate->rate_2nd === null) {
                    $warnings[] = 'Yra broko, bet įkainyje nenurodyta 2 rūšies kaina (skaičiuojama pilna kaina)';
                }
            }
            if ($e->rate_applied === null) {
                $warnings[] = 'Nėra galiojančio įkainio';
            }
            if ($dups->has($dupKey($e))) {
                $warnings[] = 'Pasikartojantis įrašas (ta pati diena, darbuotojas ir darbas)';
            }
            $k = $e->operation->stage === 'baking' ? $e->work_date->toDateString().'|'.$e->production_product_id : null;
            if ($k && $baked->has($k) && $produced->has($k) && $baked[$k] > $produced[$k] + 0.001) {
                $warnings[] = sprintf('Įskaityta %.1f kg, o pagaminta tik %.1f kg', $baked[$k], $produced[$k]);
            }
            if ($k && $baked->has($k) && ! $produced->has($k)) {
                $warnings[] = 'Tą dieną šios rūšies gamyba neužregistruota';
            }
            $e->warnings = $warnings;

            return $e;
        })->values();
    }

    /** Apmokamas pagrindas: valandos arba įskaitytas kiekis. */
    private function base(WorkEntry $e): float
    {
        return $e->operation->pay_basis === 'hours' ? (float) $e->hours : (float) $e->qty;
    }

    /** Broko (2 rūšies) kg - įeina į bendrą įskaitytą kiekį; tik kepimui. */
    private function defectKg(WorkEntry $e): float
    {
        if ($e->operation->stage !== 'baking' || $e->operation->pay_basis !== 'qty') {
            return 0.0;
        }

        return min((float) ($e->details['defect_kg'] ?? 0), (float) $e->qty);
    }

    /** Suma: geri kg × įkainis + broko kg × 2 rūšies įkainis (jei jo nėra - pilnas įkainis). */
    private function amountFor(WorkEntry $e, float $rate, ?float $rate2): float
    {
        $defect = $this->defectKg($e);

        return round(($this->base($e) - $defect) * $rate + $defect * ($rate2 ?? $rate), 2);
    }

    public function storeEntry(Request $request)
    {
        $e = new WorkEntry(['created_by_id' => $request->user()?->id]);
        $e->fill($this->entryData($request))->save();

        return response()->json($this->computed(collect([$e->load(['worker', 'operation', 'productionProduct', 'lWeek'])]))->first(), 201);
    }

    public function updateEntry(Request $request, int $id)
    {
        $e = WorkEntry::findOrFail($id);
        if ($e->is_locked) {
            return response()->json(['message' => 'Įrašas patvirtintas – pirma atšaukite patvirtinimą.'], 423);
        }
        $e->update($this->entryData($request));

        return $this->computed(collect([$e->load(['worker', 'operation', 'productionProduct', 'lWeek'])]))->first();
    }

    public function destroyEntry(int $id)
    {
        $e = WorkEntry::findOrFail($id);
        if ($e->is_locked) {
            return response()->json(['message' => 'Įrašas patvirtintas – trinti negalima.'], 423);
        }
        $e->delete();

        return response()->noContent();
    }

    /**
     * Darbo lapo laukai pagal darbo etapą:
     *  - kiaušinių mušimas: pilni kibirėliai × norma + nepilnas kibirėlis = masė; apmokama už sumuštus vnt.;
     *  - tešlos maišymas: maišymai × kg / maišymą = apmokami kg;
     *  - valandinis: valandos (arba pradžia–pabaiga − pertrauka);
     *  - kiti: įskaitytas kiekis.
     */
    private function entryData(Request $request): array
    {
        $d = $request->validate([
            'work_date'             => 'required|date',
            'worker_id'             => 'required|exists:workers,id',
            'work_operation_id'     => 'required|exists:work_operations,id',
            'production_product_id' => 'nullable|exists:production_products,id',
            'l_week_id'             => 'nullable|exists:l_weeks,id',
            'shift'                 => 'nullable|string|max:20',
            'qty'                   => 'nullable|numeric|gt:0|max:1000000',
            'hours'                 => 'nullable|numeric|gt:0|max:24',
            'notes'                 => 'nullable|string|max:255',
            'details'               => 'nullable|array',
            'details.buckets_full'  => 'nullable|integer|min:0|max:1000',
            'details.partial_kg'    => 'nullable|numeric|min:0|max:1000',
            'details.eggs_count'    => 'nullable|integer|min:1|max:1000000',
            'details.mixes'         => 'nullable|numeric|gt:0|max:1000',
            'details.kg_per_mix'    => 'nullable|numeric|gt:0|max:1000',
            'details.start'         => 'nullable|date_format:H:i',
            'details.end'           => 'nullable|date_format:H:i',
            'details.break_min'     => 'nullable|integer|min:0|max:600',
            'details.units'         => 'nullable|integer|min:0|max:1000000',
            'details.document'      => 'nullable|string|max:50',
            'details.destination'   => 'nullable|string|max:150',
            'details.defect_kg'     => 'nullable|numeric|min:0|max:1000000',
        ]);
        $op = WorkOperation::findOrFail($d['work_operation_id']);
        $det = $d['details'] ?? [];
        $fail = fn (string $field, string $msg) => throw ValidationException::withMessages([$field => $msg]);

        if ($op->stage === 'eggs') {
            $norm = $op->norm_kg ?: 11.0;
            if (empty($det['eggs_count'])) {
                $fail('details.eggs_count', 'Įveskite sumuštų kiaušinių skaičių (vnt.).');
            }
            if (($det['partial_kg'] ?? 0) >= $norm) {
                $fail('details.partial_kg', "Nepilno kibirėlio masė turi būti mažesnė nei {$norm} kg.");
            }
            $mass = round(($det['buckets_full'] ?? 0) * $norm + ($det['partial_kg'] ?? 0), 3);
            if ($mass <= 0) {
                $fail('details.buckets_full', 'Įveskite kibirėlių skaičių arba nepilno kibirėlio masę.');
            }
            $det['mass_kg'] = $mass;
            $det['egg_avg_g'] = round($mass / $det['eggs_count'] * 1000, 2);
            $d['qty'] = $det['eggs_count'];
            $d['hours'] = null;
        } elseif ($op->stage === 'mixing') {
            if (empty($det['mixes'])) {
                $fail('details.mixes', 'Įveskite maišymų skaičių.');
            }
            $det['kg_per_mix'] = (float) ($det['kg_per_mix'] ?? $op->norm_kg ?? 17.5);
            $d['qty'] = round($det['mixes'] * $det['kg_per_mix'], 3);
            $d['hours'] = null;
        } elseif ($op->pay_basis === 'hours') {
            if (! empty($det['start']) && ! empty($det['end'])) {
                [$sh, $sm] = array_map('intval', explode(':', $det['start']));
                [$eh, $em] = array_map('intval', explode(':', $det['end']));
                $min = ($eh * 60 + $em) - ($sh * 60 + $sm);
                if ($min <= 0) {
                    $min += 24 * 60; // naktinė pamaina per vidurnaktį
                }
                $d['hours'] = round(($min - ($det['break_min'] ?? 0)) / 60, 2);
            }
            if (empty($d['hours']) || $d['hours'] <= 0) {
                $fail('hours', 'Įveskite apmokamas valandas (arba darbo pradžią ir pabaigą).');
            }
            $d['qty'] = null;
        } else {
            if (empty($d['qty'])) {
                $fail('qty', 'Įveskite įskaitomą kiekį.');
            }
            // kepimo / gamybos lape valandos fiksuojamos informacijai (apmokama pagal kiekį)
            if ($op->stage !== 'baking') {
                $d['hours'] = null;
                unset($det['defect_kg']);
            } elseif (($det['defect_kg'] ?? 0) > $d['qty']) {
                $fail('details.defect_kg', 'Brokas negali būti didesnis už visą iškeptą kiekį.');
            }
        }
        $d['details'] = $det ?: null;

        return $d;
    }

    /** Patvirtinimas / atšaukimas: patvirtinant užfiksuojamas įkainis ir suma. */
    public function lockEntry(Request $request, int $id)
    {
        $e = WorkEntry::with('operation')->findOrFail($id);
        $this->setApproved($e, ! $e->is_locked, $request->user()?->id);

        return $this->computed(collect([$e->load(['worker', 'operation', 'productionProduct', 'lWeek'])]))->first();
    }

    /** Laikotarpio patvirtinimas: patvirtinami visi įrašai, kurie turi įkainį ir neturi įspėjimų. */
    public function approvePeriod(Request $request)
    {
        $f = $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after_or_equal:from',
            'workshop' => 'nullable|in:'.self::WORKSHOPS,
        ]);
        $rows = $this->computed($this->query($f)->where('is_locked', false)->get());
        $ok = $rows->filter(fn ($e) => empty($e->warnings));
        DB::transaction(fn () => $ok->each(fn ($e) => $this->setApproved(WorkEntry::with('operation')->find($e->id), true, $request->user()?->id)));

        return ['approved' => $ok->count(), 'skipped' => $rows->count() - $ok->count()];
    }

    private function setApproved(WorkEntry $e, bool $approve, ?int $userId): void
    {
        if ($approve) {
            $rates = WorkRate::where('work_operation_id', $e->work_operation_id)->get()->groupBy('work_operation_id');
            $rate = $this->rateFor($rates, $e);
            if (! $rate) {
                throw ValidationException::withMessages(['rate' => 'Nėra galiojančio įkainio – patvirtinti negalima.']);
            }
            $defect = $this->defectKg($e);
            if ($defect > 0 && $rate->rate_2nd === null) {
                throw ValidationException::withMessages(['rate' => 'Yra broko, bet įkainyje nenurodyta 2 rūšies kaina – patvirtinti negalima.']);
            }
            $details = $e->details ?? [];
            if ($defect > 0) {
                $details['rate_2nd_applied'] = $rate->rate_2nd; // užfiksuojama kartu su pagrindiniu įkainiu
            } else {
                unset($details['rate_2nd_applied']);
            }
            $e->forceFill([
                'is_locked' => true, 'rate_applied' => $rate->rate, 'amount' => $this->amountFor($e, $rate->rate, $rate->rate_2nd),
                'details' => $details ?: null,
                'approved_by_id' => $userId, 'approved_at' => now(),
            ])->saveQuietly();
            $e->logAudit('locked', ['rate' => $rate->rate, 'rate_2nd' => $defect > 0 ? $rate->rate_2nd : null, 'amount' => $e->amount]);
        } else {
            $e->forceFill(['is_locked' => false, 'rate_applied' => null, 'amount' => null, 'approved_by_id' => null, 'approved_at' => null])->saveQuietly();
            $e->logAudit('unlocked');
        }
    }

    // ---------- Suvestinė ----------

    /** Suvestinė pagal darbuotoją ir darbą už laikotarpį (preliminarus atlygis). */
    public function summary(Request $request)
    {
        $f = $request->validate([
            'from'     => 'required|date',
            'to'       => 'required|date|after_or_equal:from',
            'workshop' => 'nullable|in:'.self::WORKSHOPS,
        ]);
        $rows = $this->computed($this->query($f)->get());

        return $rows->groupBy('worker_id')->map(function ($g) {
            $w = $g->first()->worker;

            return [
                'worker'     => ['id' => $w->id, 'name' => $w->name, 'position' => $w->position, 'workshop' => $w->workshop],
                'hours'      => round($g->sum('hours'), 2),
                'amount'     => round($g->sum(fn ($e) => $e->amount ?? 0), 2),
                'entries'    => $g->count(),
                'unapproved' => $g->where('is_locked', false)->count(),
                'warnings'   => $g->filter(fn ($e) => ! empty($e->warnings))->count(),
                'operations' => $g->groupBy('work_operation_id')->map(fn ($o) => [
                    'name'   => $o->first()->operation->name,
                    'unit'   => $o->first()->operation->unit,
                    'basis'  => $o->first()->operation->pay_basis,
                    'qty'    => round($o->sum('qty'), 3),
                    'hours'  => round($o->sum('hours'), 2),
                    'amount' => round($o->sum(fn ($e) => $e->amount ?? 0), 2),
                ])->values(),
            ];
        })->sortBy('worker.name')->values();
    }
}
