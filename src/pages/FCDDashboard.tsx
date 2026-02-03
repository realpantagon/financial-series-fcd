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

  const totalInterest = entries
    .filter((e) => e.status === "Interest")
    .reduce((sum, e) => sum + Number(e.usd) + (Number(e.thb) || 0), 0)

  const rateChartData = entries
    .filter((e) => e.rate)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => ({
      date: format(parseISO(entry.date), "dd/MM HH:mm"),
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
        newStatus = "IN"
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
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total USD</div>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(stats?.total_usd || 0, "USD")}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Total THB</div>
            <div className="text-xl font-bold text-slate-900">{formatCurrency(stats?.total_thb || 0, "THB")}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Avg Rate</div>
            <div className="text-xl font-bold text-slate-900">{stats?.weighted_avg_rate.toFixed(4) || "0.0000"}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-gray-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Sum Interest</div>
            <div className="text-xl font-bold text-sky-600">{formatCurrency(totalInterest, "USD")}</div>
          </div>
        </div>

        {/* Exchange Rate Chart */}
        {rateChartData.length > 0 && (
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Exchange Rate per Record</h2>
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rateChartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                    tickFormatter={(value) => value.toFixed(2)}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8 }}
                    labelStyle={{ fontWeight: 600, color: "#0f172a" }}
                    formatter={(value?: number) => (value ?? 0).toFixed(2)}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} name="Rate" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Add Entry Form */}
        <div className="bg-white rounded-lg border border-gray-200">
          <button
            onClick={() => setShowAddEntry(!showAddEntry)}
            className="w-full px-4 py-3 flex justify-between items-center text-left"
          >
            <h2 className="text-lg font-semibold text-slate-900">Add Entry</h2>
            <span className="text-slate-600 text-xl">{showAddEntry ? '−' : '+'}</span>
          </button>
          {showAddEntry && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Transaction Type</span>
                <select
                  value={entryData.tx_type}
                  onChange={(e) => handleTxTypeChange(e.target.value as FCDTxType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white"
                >
                  <option value="FX">FX</option>
                  <option value="GOLD_BUY">Gold Buy</option>
                  <option value="GOLD_SELL">Gold Sell</option>
                  <option value="INTEREST">Interest</option>
                  <option value="TRANSFER">Transfer</option>
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  {entryData.tx_type === 'FX' && "Currency exchange with rate"}
                  {entryData.tx_type !== 'FX' && <span className="text-amber-600">THB & Rate are for FX only (will be null)</span>}
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">USD</span>
                <Input
                  type="number"
                  step="0.01"
                  value={entryData.usd || ""}
                  onChange={(e) => setEntryData({ ...entryData, usd: Number.parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </label>

              {entryData.tx_type === 'FX' && (
                <>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">THB</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={entryData.thb || ""}
                      onChange={(e) => setEntryData({ ...entryData, thb: Number.parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 mb-1 block">Rate (THB / USD)</span>
                    <Input
                      type="number"
                      step="0.0001"
                      value={entryData.rate || ""}
                      onChange={(e) => setEntryData({ ...entryData, rate: Number.parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Date & Time (System Time)</span>
                <Input
                  type="datetime-local"
                  value={entryData.date}
                  onChange={(e) => setEntryData({ ...entryData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Status</span>
                <select
                  value={entryData.status}
                  onChange={(e) => setEntryData({ ...entryData, status: e.target.value })}
                  disabled={entryData.tx_type !== 'TRANSFER'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="IN">IN</option>
                  <option value="OUT">OUT</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 mb-1 block">Note</span>
                <Input
                  type="text"
                  value={entryData.note || ""}
                  onChange={(e) => setEntryData({ ...entryData, note: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  placeholder="Optional"
                />
              </label>
              <Button onClick={handleAddEntry} className="w-full bg-sky-500 hover:bg-sky-600 text-white py-3 font-semibold">
                Save entry
              </Button>
            </div>
          )}
        </div>

        {/* Entries List */}
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">All Entries</h2>
          <div className="space-y-3">
            {[...entries]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((entry) => (
                <div key={entry.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-sky-100 text-sky-700">
                      {entry.status}
                    </span>
                    <span className="text-sm text-slate-600">
                      {/* Backward compatibility: if date has default T00:00:00 or T00:00:00+00 it usually means old date. 
                          We display full DateTime now. Old dates will show 00:00. */}
                      {format(parseISO(entry.date), "MMM dd, yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-900">{formatCurrency(entry.usd, "USD")}</span>
                    <span className="text-slate-600">{formatCurrency(entry.thb || 0, "THB")}</span>
                  </div>
                  {entry.rate && <div className="text-sm text-slate-600">Rate: {entry.rate.toFixed(4)}</div>}
                  {entry.note && (
                    <div className="mt-2 text-xs text-slate-600 bg-white px-2 py-1 rounded border border-gray-200">
                      {entry.note}
                    </div>
                  )}
                </div>
              ))}

            {entries.length === 0 && (
              <div className="text-center py-8 text-slate-600">No entries yet. Add your first FCD entry.</div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-end sm:items-center sm:justify-center z-50">
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto animate-slide-up">
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
