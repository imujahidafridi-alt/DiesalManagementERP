import { useState, useEffect, useCallback } from 'react'

export interface PaginatedGridOptions {
  initialSortKey?: string
  initialSortDir?: 'asc' | 'desc'
  defaultFilters?: Record<string, any>
}

export function usePaginatedGrid(
  gridId: 'purchases' | 'sales' | 'transfers' | 'drivers' | 'customers' | 'suppliers' | 'inventory' | 'audit',
  options: PaginatedGridOptions = {}
) {
  const { initialSortKey = 'transactionDate', initialSortDir = 'desc', defaultFilters = {} } = options

  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir)
  const [filters, setFilters] = useState<Record<string, any>>(defaultFilters)
  const [cursors, setCursors] = useState<Record<number, string | undefined>>({ 1: undefined })

  // Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
      setCursors({ 1: undefined })
    }, 300)
    return () => clearTimeout(handler)
  }, [search])

  const loadPage = useCallback(
    async (targetPage: number, targetPageSize = pageSize) => {
      setLoading(true)
      try {
        const cursorVal = cursors[targetPage]
        const res = await window.api.invoke('datagrid:fetchPage', {
          gridId,
          page: targetPage,
          pageSize: targetPageSize,
          search: debouncedSearch,
          sortKey,
          sortDir,
          filters,
          cursor: cursorVal,
        })
        setData(res.rows)
        setTotalCount(res.totalCount)

        if (res.nextCursor) {
          setCursors((prev) => ({
            ...prev,
            [targetPage + 1]: res.nextCursor,
          }))
        }
      } catch (e) {
        console.error(`Error loading page ${targetPage} for grid ${gridId}:`, e)
      } finally {
        setLoading(false)
      }
    },
    [gridId, debouncedSearch, sortKey, sortDir, filters, pageSize, cursors]
  )

  useEffect(() => {
    loadPage(page)
  }, [page, pageSize, debouncedSearch, sortKey, sortDir, filters])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
    setCursors({ 1: undefined })
  }

  const handleSortChange = (key: string, dir: 'asc' | 'desc') => {
    setSortKey(key)
    setSortDir(dir)
    setPage(1)
    setCursors({ 1: undefined })
  }

  const handleFiltersChange = (newFilters: Record<string, any>) => {
    setFilters(newFilters)
    setPage(1)
    setCursors({ 1: undefined })
  }

  return {
    data,
    loading,
    page,
    pageSize,
    totalCount,
    search,
    setSearch,
    sortKey,
    sortDir,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    handleFiltersChange,
    reload: () => loadPage(page),
  }
}
export type UsePaginatedGridReturn = ReturnType<typeof usePaginatedGrid>
