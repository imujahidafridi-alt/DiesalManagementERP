import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUiStore, useAppStore } from '@/store'
import { Search, CreditCard, Users, Truck, ArrowLeftRight, Settings, ShoppingBag, FileText, FileDown } from 'lucide-react'
import clsx from 'clsx'

const navigationItems = [
  { id: 'nav-1', title: 'Dashboard Overview', category: 'Navigation', path: '/', icon: FileText, entityId: undefined },
  { id: 'nav-2', title: 'Purchases Ledger Register', category: 'Navigation', path: '/purchases', icon: ShoppingBag, entityId: undefined },
  { id: 'nav-3', title: 'Diesel Fleet Transfers', category: 'Navigation', path: '/transfers', icon: ArrowLeftRight, entityId: undefined },
  { id: 'nav-4', title: 'Customer Sales Register', category: 'Navigation', path: '/sales', icon: CreditCard, entityId: undefined },
  { id: 'nav-5', title: 'Drivers Directory Registry', category: 'Navigation', path: '/drivers', icon: Truck, entityId: undefined },
  { id: 'nav-6', title: 'Customer Credit Accounts', category: 'Navigation', path: '/customers', icon: Users, entityId: undefined },
  { id: 'nav-7', title: 'Supplier Refinery Directory', category: 'Navigation', path: '/suppliers', icon: Users, entityId: undefined },
  { id: 'nav-8', title: 'Stock Levels & WAC values', category: 'Navigation', path: '/inventory', icon: FileText, entityId: undefined },
  { id: 'nav-9', title: 'Operational Report Center', category: 'Navigation', path: '/reports', icon: FileDown, entityId: undefined },
  { id: 'nav-10', title: 'System settings', category: 'Navigation', path: '/settings', icon: Settings, entityId: undefined },
]

export default function SearchDialog() {
  const { searchOpen, setSearchOpen, setActiveLookupId } = useUiStore()
  const { customers, drivers, suppliers, fetchCustomers, fetchDrivers, fetchSuppliers } = useAppStore()
  
  const [query, setQuery] = useState('')
  const [allTransactions, setAllTransactions] = useState<any[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // Load lists and transactions when search dialog is opened
  useEffect(() => {
    if (searchOpen) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
      
      // Fetch references in parallel
      fetchCustomers()
      fetchDrivers()
      fetchSuppliers()
      
      window.api.invoke('transactions:list').then((txs) => {
        setAllTransactions(txs || [])
      }).catch(console.error)
    }
  }, [searchOpen])

  // Process and filter results across all categories
  const filteredResults = (() => {
    const q = query.toLowerCase().trim()
    if (!q) return navigationItems // show navigation shortcuts by default

    const results: { id: string; title: string; category: string; path: string; entityId?: string; icon: any }[] = []

    // 1. Navigation Menus
    navigationItems.forEach((item) => {
      if (item.title.toLowerCase().includes(q)) {
        results.push(item)
      }
    })

    // 2. Customers
    customers.forEach((c) => {
      const match =
        c.companyName.toLowerCase().includes(q) ||
        (c.contactPerson || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.address || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q)
      if (match) {
        results.push({
          id: `customer-${c.id}`,
          title: `${c.companyName} (Contact: ${c.contactPerson || 'N/A'})`,
          category: 'Customer',
          path: '/customers',
          entityId: c.id,
          icon: Users,
        })
      }
    })

    // 3. Drivers
    drivers.forEach((d) => {
      const match =
        d.name.toLowerCase().includes(q) ||
        (d.phone || '').toLowerCase().includes(q) ||
        (d.address || '').toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q)
      if (match) {
        results.push({
          id: `driver-${d.id}`,
          title: `Driver ${d.name} (${d.status})`,
          category: 'Driver',
          path: '/drivers',
          entityId: d.id,
          icon: Truck,
        })
      }
    })

    // 4. Suppliers
    suppliers.forEach((s) => {
      const match =
        s.companyName.toLowerCase().includes(q) ||
        (s.contactPerson || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.notes || '').toLowerCase().includes(q)
      if (match) {
        results.push({
          id: `supplier-${s.id}`,
          title: `Supplier ${s.companyName}`,
          category: 'Supplier',
          path: '/suppliers',
          entityId: s.id,
          icon: Users,
        })
      }
    })



    // 6. Transactions
    allTransactions.forEach((t) => {
      const match =
        t.transactionNumber.toLowerCase().includes(q) ||
        (t.referenceNumber || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      if (match) {
        let route = '/purchases'
        if (t.transactionType === 'SALE') route = '/sales'
        if (t.transactionType === 'TRANSFER') route = '/transfers'
        if (t.transactionType === 'ADJUSTMENT' || t.transactionType === 'RETURN' || t.transactionType === 'OPENING_BALANCE') route = '/inventory'

        results.push({
          id: `tx-${t.id}`,
          title: `${t.transactionType} ${t.transactionNumber} - Vol: ${t.quantity}L (Ref: ${t.referenceNumber || 'N/A'})`,
          category: 'Transaction',
          path: route,
          entityId: t.id,
          icon: CreditCard,
        })
      }
    })

    return results.slice(0, 30) // cap search results at 30 items
  })()

  const handleSelect = (item: typeof filteredResults[0]) => {
    if (item.entityId) {
      setActiveLookupId(item.entityId)
    }
    navigate(item.path)
    setSearchOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchOpen(false)
      e.preventDefault()
    } else if (e.key === 'ArrowDown') {
      setActiveIndex((prev) => (filteredResults.length > 0 ? (prev + 1) % filteredResults.length : 0))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setActiveIndex((prev) => (filteredResults.length > 0 ? (prev - 1 + filteredResults.length) % filteredResults.length : 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (filteredResults[activeIndex]) {
        handleSelect(filteredResults[activeIndex])
      }
      e.preventDefault()
    }
  }

  if (!searchOpen) return null

  return (
    <div className="fixed inset-0 z-[9950] flex items-start justify-center pt-[15vh] p-4 select-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-xs" onClick={() => setSearchOpen(false)} />

      {/* Search Card */}
      <div className="relative w-full max-w-lg bg-white rounded border shadow-2xl overflow-hidden flex flex-col max-h-[60vh]">
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b px-4 py-3 bg-gray-50/50">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-xs focus:outline-none placeholder-gray-400 select-text"
            placeholder="Search transactions, customers, suppliers, drivers... (Enter to go, Esc to exit)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-auto py-2">
          {filteredResults.length === 0 ? (
            <div className="px-6 py-8 text-xs text-gray-400 text-center">No matching records found.</div>
          ) : (
            filteredResults.map((item, idx) => {
              const Icon = item.icon
              const isActive = idx === activeIndex

              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={clsx(
                    'px-4 py-2 flex items-center justify-between cursor-pointer transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={14} className={clsx('shrink-0', isActive ? 'text-white' : 'text-gray-400')} />
                    <span className="text-xs font-semibold truncate">{item.title}</span>
                  </div>
                  <span
                    className={clsx(
                      'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider',
                      isActive ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {item.category}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
