import { useEffect, useState } from 'react'

export default function useClientPagination<T>(rows: T[]) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  useEffect(() => { setPage(1) }, [rows])
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / limit)))
  return {
    rows: rows.slice((currentPage - 1) * limit, currentPage * limit),
    props: {
      page: currentPage,
      limit,
      total: rows.length,
      onPageChange: setPage,
      onLimitChange: (next: number) => { setLimit(next); setPage(1) },
      limitOptions: [10, 25, 50, 100],
    },
  }
}
