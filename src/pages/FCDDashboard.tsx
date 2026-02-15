"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { fetchFCDEntries, addFCDEntry, calculateFCDStats, formatCurrency } from "../api/fcd"
import type { FCDEntry, FCDStats, NewFCDEntry, FCDTxType } from "../api/fcd/types"
import { format, parseISO, parse } from "date-fns"
import Input from "../components/Input"
import Button from "../components/Button"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface ExtractedFields {
  THB: number | null
  USD: number | null
  Rate: number | null
  Date: string | null
}

function parseExtractedDate(dateStr: string | null): string {
  // Return format compatible with datetime-local (yyyy-MM-ddThh:mm)
  if (!dateStr) return format(new Date(), "yyyy-MM-dd'T'HH:mm")

  try {
    // Attempt cleaning typical OCR artifacts
    const cleanDate = dateStr.replace(/Submission Date/i, "").trim()
    // Try parsing with time first
    const parsedWithTime = parse(cleanDate, "d MMMM yyyy - h:mm a", new Date())
    if (!isNaN(parsedWithTime.getTime())) {
      return format(parsedWithTime, "yyyy-MM-dd'T'HH:mm")
    }

    // Fallback to date only (default to current time or 00:00? User requested User Local time default if not specified, 
    // but if OCR found a date only, typically it implies 00:00 or current time. 
    // Let's use current time for the time part if missing, or 00:00 if that's safer. 
    // The prompt says "If user doesn't select time -> set to current time". 
    // For OCR, probably safer to keep current time?
    const cleanDateOnly = dateStr.split("-")[0].trim()
    const parsedDate = parse(cleanDateOnly, "d MMMM yyyy", new Date())

    // Merge parsed date with current time
    const now = new Date()
    parsedDate.setHours(now.getHours(), now.getMinutes())

    return format(parsedDate, "yyyy-MM-dd'T'HH:mm")
  } catch {
    return format(new Date(), "yyyy-MM-dd'T'HH:mm")
  }
}

export default function FCDDashboard() {
  const [entries, setEntries] = useState<FCDEntry[]>([])
  const [stats, setStats] = useState<FCDStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Modal + OCR
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [image, setImage] = useState<string | null>(null)
  const [modalFields, setModalFields] = useState<ExtractedFields | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)

  // UI State
  const [showAddEntry, setShowAddEntry] = useState(false)

  // Entry form
  const [entryData, setEntryData] = useState<NewFCDEntry>({
    tx_type: "FX",
    status: "IN",
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    usd: 0,
    thb: null,
    rate: null,
    note: "",
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const data = await fetchFCDEntries()
      setEntries(data)
      const calculatedStats = calculateFCDStats(data)
      setStats(calculatedStats)
    } catch (error) {
      console.error("Error fetching FCD data:", error)
    } finally {
      setLoading(false)
    }
  }


  const rateChartData = entries
    .filter((e) => e.rate)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => ({
      date: format(parseISO(entry.date), "dd/MM"),
      rate: Number(entry.rate || 0),
    }))

  const handleTxTypeChange = (newType: FCDTxType) => {
    let newStatus = entryData.status
    let newThb = entryData.thb
    let newRate = entryData.rate

    switch (newType) {
      case "FX":
        newStatus = "IN"
        // Ensure THB/Rate are numeric if switching to FX, or keep them if they are valid
        newThb = typeof newThb === 'number' ? newThb : 0
        newRate = typeof newRate === 'number' ? newRate : 0
        break
      case "GOLD_BUY":
        newStatus = "OUT"
        newThb = null
        newRate = null
        break
      case "GOLD_SELL":
        newStatus = "IN"
        newThb = null
        newRate = null
        break
      case "INTEREST":
        newStatus = "Interest"
        newThb = null
        newRate = null
        break
      case "TRANSFER":
        if (newStatus !== "IN" && newStatus !== "OUT") newStatus = "IN"
        newThb = null
        newRate = null
        break
    }
    setEntryData({ ...entryData, tx_type: newType, status: newStatus, thb: newThb, rate: newRate })
  }

  const handleAddEntry = async () => {
    // Validation: FX requires rate & thb
    if (entryData.tx_type === "FX") {
      if ((entryData.rate ?? 0) <= 0 || (entryData.thb ?? 0) <= 0) {
        alert("For FX, Rate and THB are required")
        return
      }
    } else {
      // Validation: Non-FX must have null thb/rate
      if (entryData.thb != null && entryData.thb !== 0) {
        alert(`For ${entryData.tx_type}, THB must be empty (null).`)
        return
      }
      if (entryData.rate != null && entryData.rate !== 0) {
        alert(`For ${entryData.tx_type}, Rate must be empty (null).`)
        return
      }
    }

    if (entryData.usd <= 0) {
      alert("Please enter USD amount")
      return
    }

    // Strict payload construction
    // Convert local datetime-local string to ISO 8601 with timezone offset
    // The input value is like "2026-02-03T15:30" (local time)
    // We want to send "2026-02-03T15:30:00+07:00"
    const dateObj = new Date(entryData.date)
    // date-fns format(date, "yyyy-MM-dd'T'HH:mm:ssXXX") will output the local time with offset
    // IMPORTANT: new Date("2026-02-03T15:30") creates a date in local timezone.
    const isoWithOffset = format(dateObj, "yyyy-MM-dd'T'HH:mm:ssXXX")

    const payload: NewFCDEntry = {
      ...entryData,
      date: isoWithOffset,
      // Force nulls for non-FX types to ensure no 0s are sent
      thb: entryData.tx_type === 'FX' ? entryData.thb : null,
      rate: entryData.tx_type === 'FX' ? entryData.rate : null,
    }

    try {
      await addFCDEntry(payload)
      setEntryData({
        tx_type: "FX",
        status: "IN",
        date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        usd: 0,
        thb: 0, // Reset to 0 for FX default
        rate: 0, // Reset to 0 for FX default
        note: "",
      })
      fetchData()
    } catch (error) {
      console.error("Error adding FCD entry:", error)
      alert("Failed to add entry")
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setImage(event.target?.result as string)
        setModalFields(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const extractText = async () => {
    if (!image) return

    setOcrLoading(true)
    setOcrProgress(0)

    try {
      const typhoonApiKey = import.meta.env.VITE_TYPHOON_API_KEY

      if (!typhoonApiKey) {
        throw new Error("Typhoon API key not found in environment variables")
      }

      setOcrProgress(20)

      const mimeType = image.split(",")[0].split(":")[1].split(";")[0]
      const blob = await fetch(image).then((r) => r.blob())
      const imageFile = new File([blob], "fcd-slip.jpg", { type: mimeType })

      const formData = new FormData()
      formData.append("file", imageFile)
      formData.append("model", "typhoon-ocr")
      formData.append("task_type", "default")
      formData.append("max_tokens", "16384")
      formData.append("temperature", "0.1")
      formData.append("top_p", "0.6")
      formData.append("repetition_penalty", "1.2")

      setOcrProgress(40)

      const typhoonResponse = await fetch("https://api.opentyphoon.ai/v1/ocr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${typhoonApiKey}`,
        },
        body: formData,
      })

      setOcrProgress(60)

      if (!typhoonResponse.ok) {
        const errorText = await typhoonResponse.text()
        throw new Error(`Typhoon OCR failed: ${errorText}`)
      }

      const typhoonResult = await typhoonResponse.json()

      setOcrProgress(80)

      let fields: ExtractedFields | null = null

      for (const pageResult of typhoonResult.results || []) {
        if (pageResult.success && pageResult.message) {
          const content = pageResult.message.choices[0].message.content

          const thbMatch =
            content.match(/Exchange from\s+([0-9,]+\.?\d*)\s*THB/i) || content.match(/([0-9,]+\.?\d+)\s*THB/i)
          const usdMatch = content.match(/To\s+([0-9,]+\.?\d*)\s*USD/i) || content.match(/([0-9,]+\.?\d+)\s*USD/i)
          const rateMatch = content.match(/1\s*USD\s*=\s*([0-9.,]+)\s*THB/i)

          const dateMatch =
            content.match(/Submission Date.*?(\d{1,2}\s+\w+\s+\d{4}(?:\s*-\s*\d{1,2}:\d{2}\s*[AP]M)?)/i) ||
            content.match(/(\d{1,2}\s+\w+\s+\d{4}(?:\s*-\s*\d{1,2}:\d{2}\s*[AP]M)?)/i)

          if (thbMatch || usdMatch || rateMatch) {
            fields = {
              THB: thbMatch ? Number.parseFloat(thbMatch[1].replace(/,/g, "")) : null,
              USD: usdMatch ? Number.parseFloat(usdMatch[1].replace(/,/g, "")) : null,
              Rate: rateMatch ? Number.parseFloat(rateMatch[1].replace(/,/g, "")) : null,
              Date: dateMatch ? dateMatch[1] : null,
            }
            break
          }
        } else if (!pageResult.success) {
          throw new Error(`OCR processing failed: ${pageResult.error || "Unknown error"}`)
        }
      }

      if (!fields) {
        throw new Error("Could not extract structured data from OCR result")
      }

      setModalFields(fields)
      setOcrProgress(100)
    } catch (error) {
      console.error("OCR Error:", error)
      alert(`Error extracting text: ${error instanceof Error ? error.message : "Please try again."}`)
    } finally {
      setOcrLoading(false)
      setOcrProgress(0)
    }
  }

  const resetOCR = () => {
    setImage(null)
    setModalFields(null)
    setShowUploadModal(false)
  }

  const fillFromModal = () => {
    if (!modalFields) return

    setEntryData({
      tx_type: "FX",
      status: "IN",
      date: parseExtractedDate(modalFields.Date),
      usd: modalFields.USD || 0,
      thb: modalFields.THB || 0,
      rate: modalFields.Rate || 0,
      note: "Auto-filled from Typhoon OCR",
    })

    setShowUploadModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-slate-600">Loading…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 mb-4">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">FCD Tracker</h1>
          </div>
          <Button
            onClick={() => setShowUploadModal(true)}
            className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 text-sm whitespace-nowrap"
          >
            Upload slip
          </Button>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Summary Cards */}
        {/* Summary Cards */}
        {/* Summary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Liquidity Section */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Liquidity
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-slate-500 text-xs mb-1">Cash Remain</div>
                  <div className={`text-2xl font-bold ${stats && stats.cash_remain < 0 ? 'text-rose-500' : 'text-slate-900'}`}>
                    {formatCurrency(stats?.cash_remain || 0, "USD")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400 mb-1">Net Flow</div>
                  <div className={`text-sm font-medium px-2 py-1 rounded-full ${stats && stats.cash_remain >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {stats && stats.cash_remain >= 0 ? '+' : ''}{((stats?.cash_remain || 0) / (stats?.total_in || 1) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
                <div>
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                    Total In
                  </div>
                  <div className="text-lg font-semibold text-emerald-600">{formatCurrency(stats?.total_in || 0, "USD")}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                    Total Out
                  </div>
                  <div className="text-lg font-semibold text-rose-500">{formatCurrency(stats?.total_out || 0, "USD")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Section */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              Performance
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-6">
              <div>
                <div className="text-xs text-slate-500 mb-1">Gold Profit</div>
                <div className={`text-xl font-bold ${stats && stats.gold_profit >= 0 ? 'text-amber-500' : 'text-rose-500'}`}>
                  {stats && stats.gold_profit > 0 ? '+' : ''}{formatCurrency(stats?.gold_profit || 0, "USD")}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Interest Income</div>
                <div className="text-xl font-bold text-sky-500">
                  +{formatCurrency(stats?.interest_income || 0, "USD")}
                </div>
              </div>
              <div className="col-span-2 pt-4 border-t border-slate-50 flex justify-between items-center">
                <div className="text-xs text-slate-400">Weighted Avg Rate</div>
                <div className="text-2xl font-mono font-medium text-slate-700 tracking-tight">
                  {stats?.weighted_avg_rate.toFixed(4) || "0.0000"} <span className="text-xs text-slate-400 font-sans">THB/USD</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exchange Rate Chart */}
        {rateChartData.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900">Exchange Rate Trend</h2>
                <p className="text-xs text-slate-500 mt-1">Rate fluctuations over time</p>
              </div>
              <div className="text-xs font-medium px-2 py-1 bg-sky-50 text-sky-600 rounded-lg">LIVE</div>
            </div>
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rateChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    angle={-90}
                    textAnchor="end"
                    height={50}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                    tickFormatter={(value) => value.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "12px", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }}
                    itemStyle={{ color: "#f8fafc" }}
                    labelStyle={{ color: "#94a3b8", marginBottom: "0.25rem", fontSize: "0.75rem" }}
                    formatter={(value: number | undefined) => [value ? value.toFixed(4) : "0.0000", 'Rate']}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#0ea5e9"
                    strokeWidth={3}
                    dot={{ r: 0, strokeWidth: 0 }}
                    activeDot={{ r: 6, stroke: "#38bdf8", strokeWidth: 3, fill: "#fff" }}
                    name="Rate"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Add Entry Form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="w-full px-5 py-4 flex justify-between items-center text-left hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </div>
              <h2 className="text-base font-bold text-slate-900">Add New Entry</h2>
            </div>
            <span className={`text-slate-400 transition-transform duration-200 ${showAddEntry ? 'rotate-180' : ''}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </span>
          </button>
          {showAddEntry && (
            <div className="px-5 pb-6 pt-2 space-y-5 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Transaction Type</span>
                  <select
                    value={entryData.tx_type}
                    onChange={(e) => handleTxTypeChange(e.target.value as FCDTxType)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 bg-white transition-all shadow-sm"
                  >
                    <option value="FX">💱 FX Exchange</option>
                    <option value="GOLD_BUY">🟡 Gold Buy</option>
                    <option value="GOLD_SELL">💰 Gold Sell</option>
                    <option value="INTEREST">📈 Interest</option>
                    <option value="TRANSFER">↔️ Transfer</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Date & Time</span>
                  <Input
                    type="datetime-local"
                    value={entryData.date}
                    onChange={(e) => setEntryData({ ...entryData, date: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">USD Amount</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={entryData.usd || ""}
                    onChange={(e) => setEntryData({ ...entryData, usd: Number.parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-sm font-medium"
                    placeholder="0.00"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Status</span>
                  <select
                    value={entryData.status}
                    onChange={(e) => setEntryData({ ...entryData, status: e.target.value })}
                    disabled={entryData.tx_type !== 'TRANSFER'}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 bg-white disabled:bg-slate-50 disabled:text-slate-400 transition-all shadow-sm"
                  >
                    <option value="IN">Create Income (IN)</option>
                    <option value="OUT">Create Expense (OUT)</option>
                    <option value="Interest">Interest Income</option>
                  </select>
                </label>

                {entryData.tx_type === 'FX' && (
                  <>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">THB Amount</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={entryData.thb || ""}
                        onChange={(e) => setEntryData({ ...entryData, thb: Number.parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-sm"
                        placeholder="0.00"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Exchange Rate</span>
                      <Input
                        type="number"
                        step="0.0001"
                        value={entryData.rate || ""}
                        onChange={(e) => setEntryData({ ...entryData, rate: Number.parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-sm"
                        placeholder="0.0000"
                      />
                    </label>
                  </>
                )}

                <label className="block md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Note</span>
                  <Input
                    type="text"
                    value={entryData.note || ""}
                    onChange={(e) => setEntryData({ ...entryData, note: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all shadow-sm"
                    placeholder="Optional description..."
                  />
                </label>
              </div>

              <Button onClick={handleAddEntry} className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-xl font-semibold shadow-lg shadow-slate-200 active:scale-[0.98] transition-all">
                Save Transaction
              </Button>
            </div>
          )}
        </div>

        {/* Entries List */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-slate-900">Recent Transactions</h2>
            <span className="text-xs font-medium text-slate-400">{entries.length} records</span>
          </div>
          <div className="space-y-3">
            {[...entries]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((entry) => {
                let icon;
                let txLabel = entry.tx_type as string;
                let amountColor = 'text-slate-900';

                // Determine Icon and Label style
                if (entry.tx_type === 'FX') {
                  icon = <span className="text-lg">💱</span>;
                  txLabel = 'FX Exchange';
                } else if (entry.tx_type === 'GOLD_BUY') {
                  icon = <span className="text-lg">🟡</span>;
                  txLabel = 'Gold Buy';
                  amountColor = 'text-slate-900';
                } else if (entry.tx_type === 'GOLD_SELL') {
                  icon = <span className="text-lg">💰</span>;
                  txLabel = 'Gold Sell';
                  amountColor = 'text-emerald-600';
                } else if (entry.tx_type === 'INTEREST' || entry.status === 'Interest') {
                  icon = <span className="text-lg">📈</span>;
                  txLabel = 'Interest';
                  amountColor = 'text-sky-600';
                } else {
                  icon = <span className="text-lg">↔️</span>;
                  txLabel = 'Transfer';
                }

                // Override color based on status if needed
                if (entry.status === 'OUT' && amountColor === 'text-slate-900') amountColor = 'text-slate-900';
                // We keep it neutral for OUT, or red if preferred. The prompt didn't specify, but neutral/dark is clean.
                // Let's make OUT amounts slightly visually distinct? 
                // Actually sticking to "Performance" colors (profit=green) is better.

                return (
                  <div key={entry.id} className="group p-4 bg-white rounded-xl border border-slate-100 hover:border-sky-100 hover:shadow-md transition-all duration-200">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-white group-hover:scale-110 transition-all">
                          {icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900 text-sm">{txLabel}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full ${entry.status === 'IN' || entry.status === 'Interest'
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-rose-50 text-rose-600'
                              }`}>
                              {entry.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span>{format(parseISO(entry.date), "dd MMM yyyy, HH:mm")}</span>
                            {entry.rate && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="font-medium text-slate-600">@{Number(entry.rate).toFixed(4)}</span>
                              </>
                            )}
                          </div>
                          {entry.note && (
                            <div className="mt-2 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg inline-block border border-slate-100 italic">
                              {entry.note}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`text-base font-bold ${amountColor}`}>
                          {entry.status === 'OUT' ? '-' : '+'}{formatCurrency(entry.usd, "USD")}
                        </div>
                        {entry.thb && (
                          <div className="text-xs text-slate-400 mt-0.5 font-medium">
                            {formatCurrency(entry.thb, "THB")}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            {entries.length === 0 && (
              <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <div className="text-4xl mb-3">📝</div>
                <p>No transactions yet.</p>
                <button onClick={() => setShowAddEntry(true)} className="text-sky-600 font-medium text-sm mt-2 hover:underline">
                  Add your first entry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal (kept essentially same but cleaned up if needed, skipping for now as not requested) */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-center z-50">
          {/* ... modal content ... reusing existing logic but container style updated above */}
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-6 max-h-[90vh] overflow-y-auto animate-slide-up shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Upload Slip</h3>
              <button
                onClick={resetOCR}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-slate-600 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="block w-full text-sm text-slate-600
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-sky-500 file:text-white
                  hover:file:bg-sky-600"
              />

              {image && (
                <div className="w-full rounded-lg overflow-hidden border border-gray-200">
                  <img src={image} alt="Uploaded slip" className="w-full h-auto" />
                </div>
              )}

              <Button
                onClick={extractText}
                disabled={ocrLoading}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 font-semibold disabled:opacity-50"
              >
                {ocrLoading ? `Extracting… ${ocrProgress}%` : "Extract text"}
              </Button>

              {modalFields && (
                <div className="space-y-3 pt-2 border-t border-gray-200">
                  <div className="text-sm text-slate-600 bg-sky-50 p-2 rounded-lg border border-sky-200">
                    Review and adjust values before filling the form.
                  </div>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">USD</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={modalFields.USD ?? ""}
                      onChange={(e) =>
                        setModalFields({ ...modalFields, USD: Number.parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">THB</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={modalFields.THB ?? ""}
                      onChange={(e) =>
                        setModalFields({ ...modalFields, THB: Number.parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">Rate</span>
                    <Input
                      type="number"
                      step="0.0001"
                      value={modalFields.Rate ?? ""}
                      onChange={(e) =>
                        setModalFields({ ...modalFields, Rate: Number.parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">Date</span>
                    <Input
                      type="text"
                      value={modalFields.Date ?? ""}
                      onChange={(e) => setModalFields({ ...modalFields, Date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="22 Dec 2025 - 12:30 AM"
                    />
                  </label>
                  <div className="flex gap-3">
                    <Button onClick={resetOCR} className="flex-1 bg-gray-100 hover:bg-gray-200 text-slate-900 py-3">
                      Clear
                    </Button>
                    <Button onClick={fillFromModal} className="flex-1 bg-sky-500 hover:bg-sky-600 text-white py-3 font-semibold">
                      Fill entry form
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
