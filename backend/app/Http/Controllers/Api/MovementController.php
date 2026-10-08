<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductMovement;
use App\Services\ProductStockService;
use Illuminate\Http\Request;

/**
 * Produkto judėjimų žurnalas (Excel: fasavimas, vidinis judėjimas, į parduotuves).
 * move / ship_out tikrina ar šaltinio sandėlyje užtenka produkto.
 */
class MovementController extends Controller
{
    public function __construct(private ProductStockService $stock) {}

    public function index(Request $request)
    {
        return ProductMovement::with(['lWeek', 'packedProduct', 'warehouseFrom', 'warehouseTo', 'shop'])
            ->when($request->type, fn ($q) => $q->where('movement_type', $request->type))
            ->orderByDesc('movement_date')
            ->orderByDesc('id')
            ->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'movement_date'      => 'required|date',
            'movement_type'      => 'required|in:pack_in,move,ship_out',
            'l_week_id'          => 'required|exists:l_weeks,id',
            'packed_product_id'  => 'required|exists:packed_products,id',
            'qty_units'          => 'required|integer|gt:0',
            'qty_kg'             => 'required|numeric|gt:0',
            'warehouse_from_id'  => 'nullable|exists:warehouses,id',
            'warehouse_to_id'    => 'nullable|exists:warehouses,id',
            'shop_id'            => 'nullable|exists:shops,id',
            'document_number'    => 'nullable|string|max:50',
            'notes'              => 'nullable|string|max:255',
        ]);

        // Tik tipui aktualūs laukai - kitaip likę formos laukai iškraipo sandėlių likučius
        $data = match ($data['movement_type']) {
            'pack_in'  => [...$data, 'warehouse_from_id' => null, 'shop_id' => null],
            'move'     => [...$data, 'shop_id' => null],
            'ship_out' => [...$data, 'warehouse_to_id' => null],
        };

        $errors = $this->validateMovement($data);
        if ($errors) {
            return response()->json(['message' => $errors], 422);
        }

        $data['created_by_id'] = $request->user()?->id;

        return response()->json(
            ProductMovement::create($data)->load(['lWeek', 'packedProduct', 'warehouseFrom', 'warehouseTo', 'shop']),
            201
        );
    }

    private function validateMovement(array $data): ?string
    {
        return match ($data['movement_type']) {
            'pack_in' => isset($data['warehouse_to_id']) ? null : 'pack_in reikalauja warehouse_to_id',
            'move' => (isset($data['warehouse_from_id'], $data['warehouse_to_id'])
                    && $data['warehouse_from_id'] != $data['warehouse_to_id'])
                ? $this->checkStock($data, $data['warehouse_from_id'])
                : 'move reikalauja skirtingų warehouse_from_id ir warehouse_to_id',
            'ship_out' => (isset($data['warehouse_from_id'], $data['shop_id']))
                ? $this->checkStock($data, $data['warehouse_from_id'])
                : 'ship_out reikalauja warehouse_from_id ir shop_id',
        };
    }

    private function checkStock(array $data, int $warehouseId): ?string
    {
        $available = $this->stock->balance($data['packed_product_id'], $data['l_week_id'], $warehouseId);
        return $data['qty_kg'] <= $available['qty_kg'] && $data['qty_units'] <= $available['qty_units']
            ? null
            : "Sandėlyje nepakanka produkto (liko {$available['qty_units']} vnt / {$available['qty_kg']} kg).";
    }

    /** Įspajamojimas: užrakintas judėjimas nebenaikinamas. */
    public function lock(int $id)
    {
        return ProductMovement::findOrFail($id)->toggleLock();
    }

    public function destroy(int $id)
    {
        $movement = ProductMovement::findOrFail($id);
        if ($movement->is_locked) {
            return response()->json(['message' => 'Įrašas įspajamotas (užrakintas) – naikinti negalima.'], 423);
        }
        // Atšaukus papildymą sandėlio likutis negali tapti neigiamas (produktas jau perkeltas/išvežtas)
        if ($movement->warehouse_to_id) {
            $left = $this->stock->balance($movement->packed_product_id, $movement->l_week_id, $movement->warehouse_to_id);
            if ($left['qty_units'] < $movement->qty_units || round($left['qty_kg'] - (float) $movement->qty_kg, 3) < 0) {
                return response()->json(['message' => 'Produktas iš šio sandėlio jau perkeltas/išvežtas – pirmiau trinkite vėlesnius judėjimus.'], 422);
            }
        }
        $movement->delete();
        return response()->noContent();
    }
}
