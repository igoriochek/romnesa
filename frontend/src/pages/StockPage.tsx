import { useEffect, useState } from 'react'
import { getShipments, getWarehouseStock, type WarehouseStockRow } from '../api'
import { Card, Err, Table, fmtKg } from '../ui'

/** Produktų likučiai sandėliuose + išvežimų suvestinė (Excel VIDINĖ SUVESTINĖ). */
export default function StockPage() {
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [ships, setShips] = useState<{ shop: string; qty_units: number; qty_kg: number; shipments: number }[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getWarehouseStock().then((r) => setStock(r.data)).catch(() => setErr('Nepavyko užkrauti likučių'))
    getShipments().then((r) => setShips(r.data)).catch(() => {})
  }, [])

  return (
    <div className="grid gap-6">
      <Err msg={err} />
      <Card title="Produktų likučiai sandėliuose">
        <Table
          cols={[
            { header: 'Sandėlis', render: (r) => r.warehouse },
            { header: 'Produktas', render: (r) => r.packed_product },
            { header: 'L savaitė', render: (r) => r.l_week },
            { header: 'Vnt', align: 'right', render: (r) => r.qty_units },
            { header: 'Kg', align: 'right', render: (r) => fmtKg(r.qty_kg) },
          ]}
          rows={stock.map((r, i) => ({ ...r, id: i }))}
          empty="Sandėliai tušti"
        />
      </Card>

      <Card title="Išvežimai pagal parduotuvę">
        <Table
          cols={[
            { header: 'Parduotuvė', render: (r) => r.shop },
            { header: 'Siuntų sk.', align: 'right', render: (r) => r.shipments },
            { header: 'Vnt', align: 'right', render: (r) => r.qty_units },
            { header: 'Kg', align: 'right', render: (r) => fmtKg(r.qty_kg) },
          ]}
          rows={ships.map((r, i) => ({ ...r, id: i }))}
          empty="Išvežimų dar nėra"
        />
      </Card>
    </div>
  )
}
