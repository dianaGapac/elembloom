"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export const DEFAULT_PAGE_SIZE = 20

export function Pagination({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  totalItems,
  onPageChange,
}: {
  page: number
  pageSize?: number
  totalItems: number
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))
  const currentPage = Math.min(page, pageCount)
  if (totalItems <= pageSize) return null

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
  return <nav className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" aria-label="Pagination">
    <p className="text-sm text-muted-foreground">Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}</p>
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page"><ChevronLeft className="size-4" /><span className="hidden sm:inline">Previous</span></Button>
      {pages.map((item) => <Button key={item} type="button" variant={item === currentPage ? "default" : "ghost"} size="sm" onClick={() => onPageChange(item)} aria-label={`Page ${item}`} aria-current={item === currentPage ? "page" : undefined}>{item}</Button>)}
      <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === pageCount} aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="size-4" /></Button>
    </div>
  </nav>
}
