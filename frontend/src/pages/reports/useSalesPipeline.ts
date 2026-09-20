import { useCallback, useEffect, useRef, useState } from 'react'
import { listFeasibilities } from '@/api/feasibilities'
import { listOrders } from '@/api/orders'
import { listQuotations } from '@/api/quotations'
import type { PagedResponse } from '@/types/common'
import type { PipelineData } from './salesReportModel'

// One page of the existing list endpoints -- the same size Sales' own pages
// read. If a list is bigger than this it is treated as unknown rather than
// shown short (see completeItems).
const LIST_PAGE_SIZE = 100
const EMPTY_PIPELINE: PipelineData = { quotations: null, feasibilities: null, readyToShipOrders: null }

/** Items of a settled list request, or null when it failed or holds more
 * rows than the page that was fetched (a count from it could be short). */
function completeItems<T>(result: PromiseSettledResult<PagedResponse<T>>): T[] | null {
  if (result.status !== 'fulfilled') return null
  return result.value.total <= result.value.items.length ? result.value.items : null
}

/**
 * The quotation / feasibility lists (and, optionally, the ready-to-ship
 * order count) that feed the sales funnel's extra stages and the attention
 * list. They describe current state, so they load once and again only on
 * `reload` -- never when a date range changes.
 */
export function useSalesPipeline({ withReadyToShip }: { withReadyToShip: boolean }) {
  const [pipeline, setPipeline] = useState<PipelineData>(EMPTY_PIPELINE)
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)

  const reload = useCallback(() => {
    const id = ++requestId.current
    setLoading(true)
    Promise.allSettled([
      listQuotations({ page: 1, page_size: LIST_PAGE_SIZE }),
      listFeasibilities({ page: 1, page_size: LIST_PAGE_SIZE }),
      withReadyToShip ? listOrders({ page: 1, page_size: 1, status: 'ready_to_ship' }) : Promise.resolve(null),
    ]).then(([quotations, feasibilities, readyToShip]) => {
      if (id !== requestId.current) return
      setPipeline({
        quotations: completeItems(quotations),
        feasibilities: completeItems(feasibilities),
        readyToShipOrders:
          readyToShip.status === 'fulfilled' && readyToShip.value ? readyToShip.value.total : null,
      })
      setLoading(false)
    })
  }, [withReadyToShip])

  useEffect(reload, [reload])

  return { pipeline, loading, reload }
}
