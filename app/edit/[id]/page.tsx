"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save, Pencil, Upload, Undo, Redo, Type, Eraser, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { getFormById, updateForm } from "@/lib/db"
import Link from "next/link"
import { detectBlankAreas } from "@/lib/image-analysis"
import { cn } from "@/lib/utils"
import { GameSearchDialog } from "@/components/GameSearchDialog"
import { GameSearchResult } from "@/lib/types"

interface FormData {
  id: string
  imageData: string
  canvasData: string | null
  timestamp: number
  size: number
  blankAreas?: Array<{ x: number; y: number; width: number; height: number }>
  drawingData?: string | null
}

type DrawingMode = "draw" | "upload"
type Tool = "draw" | "text" | "eraser"

export default function EditFormPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null) // Separate canvas for drawings and text
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const hoverCanvasRef = useRef<HTMLCanvasElement>(null) // 新增悬停效果专用的canvas
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState<FormData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentMode, setCurrentMode] = useState<DrawingMode>("upload")
  const [currentTool, setCurrentTool] = useState<Tool>("draw")
  const [isDrawing, setIsDrawing] = useState(false)
  const [showBlankAreas, setShowBlankAreas] = useState(false)
  const [adaptiveUpload, setAdaptiveUpload] = useState(true)
  const [brushColor, setBrushColor] = useState("#FF0000")
  const [textColor, setTextColor] = useState("#000000")
  const [brushSize, setBrushSize] = useState(5)
  const [eraserSize, setEraserSize] = useState(20)
  const [textSize, setTextSize] = useState(24)
  const [history, setHistory] = useState<string[]>([])
  const [redoHistory, setRedoHistory] = useState<string[]>([])
  const [textInput, setTextInput] = useState("")
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 })
  const [isAddingText, setIsAddingText] = useState(false)
  const textInputRef = useRef<HTMLInputElement>(null)
  const [baseImage, setBaseImage] = useState<string | null>(null)
  const [clickedArea, setClickedArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const tabsRef = useRef<HTMLDivElement>(null)
  const drawingToolbarRef = useRef<HTMLDivElement>(null)
  const [isToolbarFixed, setIsToolbarFixed] = useState(false)
  const [drawingToolbarHeight, setDrawingToolbarHeight] = useState(0)

  const [previewText, setPreviewText] = useState("")
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [hoveredArea, setHoveredArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showSearchDialog, setShowSearchDialog] = useState(false)

  const loadForm = async () => {
    setIsLoading(true)
    try {
      // Make sure DB is initialized first
      await import("@/lib/db").then(({ ensureDBInitialized }) => ensureDBInitialized())

      const form = await getFormById(id)
      if (form) {
        setFormData(form as FormData)

        // Store the original image as the base image (form + uploaded images)
        setBaseImage(form.imageData)

        // Initialize history with the original drawing data or empty
        if ((form as any).drawingData) {
          setHistory([(form as any).drawingData])
        } else {
          // Create an empty drawing layer
          const emptyDrawingData = await createEmptyDrawingLayer(form.imageData)
          setHistory([emptyDrawingData])
        }

        // Analyze blank areas if not already done
        if (!form.blankAreas || form.blankAreas.length === 0) {
          const areas = await detectBlankAreas(form.imageData, true) // Pass true for higher tolerance
          const updatedForm = {
            ...form,
            blankAreas: areas,
          }
          await updateForm(updatedForm)
          setFormData(updatedForm as FormData)
        }
      } else {
        router.push("/")
      }
    } catch (error) {
      console.error("Failed to load form:", error)
      // Add retry logic for database initialization errors
      if (error instanceof Error && error.message.includes("Database not initialized")) {
        console.log("Retrying database initialization...")
        setTimeout(() => loadForm(), 500) // Retry after a short delay
      } else {
        router.push("/")
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Create an empty transparent drawing layer with the same dimensions as the base image
  const createEmptyDrawingLayer = (baseImageData: string): Promise<string> => {
    return new Promise<string>((resolve) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = document.createElement("canvas")
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext("2d")
        if (ctx) {
          // Create a transparent canvas of the same size
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL("image/png"))
        } else {
          // Fallback if context creation fails
          resolve("")
        }
      }
      img.src = baseImageData
    })
  }

  useEffect(() => {
    loadForm()
  }, [id, router])

  // 防止画图时页面滚动
  useEffect(() => {
    const preventScrollOnCanvas = (e: TouchEvent) => {
      // 只有在画图模式且画笔或橡皮工具激活时才阻止默认行为
      if (currentMode === "draw" && (currentTool === "draw" || currentTool === "eraser") && isDrawing) {
        e.preventDefault()
      }
    }

    // 在document级别捕获阶段添加事件监听
    document.addEventListener('touchmove', preventScrollOnCanvas, { passive: false })
    
    return () => {
      document.removeEventListener('touchmove', preventScrollOnCanvas)
    }
  }, [currentMode, currentTool, isDrawing])

  // Update container width when window resizes
  useEffect(() => {
    const updateContainerWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }

    // Initial width
    updateContainerWidth()

    // Add resize listener
    window.addEventListener("resize", updateContainerWidth)

    return () => {
      window.removeEventListener("resize", updateContainerWidth)
    }
  }, [])

  useEffect(() => {
    if (formData && canvasRef.current && drawingCanvasRef.current) {
      const baseCanvas = canvasRef.current
      const drawingCanvas = drawingCanvasRef.current
      const baseCtx = baseCanvas.getContext("2d")
      const drawingCtx = drawingCanvas.getContext("2d")

      if (baseCtx && drawingCtx) {
        // Load the base image (form + uploaded images)
        const baseImg = new Image()
        baseImg.crossOrigin = "anonymous"
        baseImg.onload = () => {
          // Set canvas dimensions to match the image
          baseCanvas.width = baseImg.width
          baseCanvas.height = baseImg.height
          drawingCanvas.width = baseImg.width
          drawingCanvas.height = baseImg.height

          // Clear and draw the base image
          baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height)
          baseCtx.drawImage(baseImg, 0, 0)

          // Load and draw the current drawing state
          const drawingImg = new Image()
          drawingImg.crossOrigin = "anonymous"
          drawingImg.onload = () => {
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height)
            drawingCtx.drawImage(drawingImg, 0, 0)
          }
          drawingImg.src = history[history.length - 1]

          // Set up overlay canvas and hover canvas
          if (overlayCanvasRef.current && hoverCanvasRef.current) {
            overlayCanvasRef.current.width = baseImg.width
            overlayCanvasRef.current.height = baseImg.height
            hoverCanvasRef.current.width = baseImg.width
            hoverCanvasRef.current.height = baseImg.height
            drawBlankAreaOverlay()
          }
        }

        // Use the current base image
        baseImg.src = formData.canvasData || formData.imageData
      }
    }
  }, [formData, history, showBlankAreas, currentMode])

  // Hide text input when changing tools or modes
  useEffect(() => {
    setIsAddingText(false)
  }, [currentTool, currentMode])

  // 添加滚动监听，只有滚动超过Tab区域才固定工具栏
  useEffect(() => {
    const handleScroll = () => {
      if (tabsRef.current) {
        const tabsBottom = tabsRef.current.children[0].children[0].getBoundingClientRect().bottom
        setIsToolbarFixed(tabsBottom < 0)
      }

      // 获取DrawingToolbar的高度
      if (drawingToolbarRef.current) {
        setDrawingToolbarHeight(drawingToolbarRef.current.getBoundingClientRect().height)
      }
    }


    window.addEventListener("scroll", handleScroll)
    return () => {
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  // 添加新的useEffect专门处理悬停效果
  useEffect(() => {
    if (currentMode === "upload" && hoverCanvasRef.current) {
      drawHoverOverlay()
    }
  }, [hoveredArea, currentMode])

  // 修改drawHoverOverlay函数
  const drawHoverOverlay = () => {
    if (!hoverCanvasRef.current) return

    const overlay = hoverCanvasRef.current
    const ctx = overlay.getContext("2d")

    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      // 只在upload模式下绘制悬停效果
      if (currentMode === "upload" && hoveredArea) {
        ctx.fillStyle = "rgba(0, 0, 255, 0.3)"
        ctx.fillRect(hoveredArea.x, hoveredArea.y, hoveredArea.width, hoveredArea.height)
      }
    }
  }

  // 修改drawBlankAreaOverlay函数，只处理红色填表区域
  const drawBlankAreaOverlay = () => {
    if (!overlayCanvasRef.current || !formData?.blankAreas) return

    const overlay = overlayCanvasRef.current
    const ctx = overlay.getContext("2d")

    if (ctx) {
      ctx.clearRect(0, 0, overlay.width, overlay.height)

      if (showBlankAreas && currentMode === "upload") {
        formData.blankAreas.forEach((area) => {
          ctx.fillStyle = "rgba(255, 0, 0, 0.3)"
          ctx.fillRect(area.x, area.y, area.width, area.height)
        })
      }
    }
  }

  // Save the current drawing state (not the base image)
  const saveDrawingState = () => {
    if (drawingCanvasRef.current) {
      const canvas = drawingCanvasRef.current
      const dataUrl = canvas.toDataURL("image/png")

      // Add to history
      setHistory([...history, dataUrl])
      setRedoHistory([])

      // Auto-save to IndexedDB
      if (formData) {
        const updatedForm = {
          ...formData,
          drawingData: dataUrl,
          timestamp: Date.now(),
        } as FormData
        updateForm(updatedForm)
        setFormData(updatedForm)
      }
    }
  }

  // Save the complete form (base image + drawings)
  const saveCompleteForm = () => {
    if (canvasRef.current && drawingCanvasRef.current) {
      // Create a temporary canvas to combine the layers
      const tempCanvas = document.createElement("canvas")
      const baseCanvas = canvasRef.current
      const drawingCanvas = drawingCanvasRef.current

      tempCanvas.width = baseCanvas.width
      tempCanvas.height = baseCanvas.height

      const ctx = tempCanvas.getContext("2d")
      if (ctx) {
        // Draw the base layer
        ctx.drawImage(baseCanvas, 0, 0)
        // Draw the drawing layer on top
        ctx.drawImage(drawingCanvas, 0, 0)

        // Get the combined image
        const combinedDataUrl = tempCanvas.toDataURL("image/png")

        // Save to IndexedDB
        if (formData) {
          const updatedForm = {
            ...formData,
            canvasData: combinedDataUrl,
            drawingData: drawingCanvas.toDataURL("image/png"),
            timestamp: Date.now(),
            size: new Blob([combinedDataUrl]).size,
          } as FormData
          updateForm(updatedForm)
          setFormData(updatedForm)
        }
      }
    }
  }

  const handleUndo = () => {
    if (history.length > 1) {
      const currentState = history[history.length - 1]
      const newHistory = history.slice(0, -1)

      setHistory(newHistory)
      setRedoHistory([currentState, ...redoHistory])

      // 更新IndexedDB
      if (formData) {
        const updatedForm = {
          ...formData,
          drawingData: newHistory[newHistory.length - 1],
          timestamp: Date.now(),
        } as FormData
        updateForm(updatedForm)
        setFormData(updatedForm)
      }
    }
  }

  const handleRedo = () => {
    if (redoHistory.length > 0) {
      const stateToRestore = redoHistory[0]
      const newRedoHistory = redoHistory.slice(1)

      setHistory([...history, stateToRestore])
      setRedoHistory(newRedoHistory)

      // 更新IndexedDB
      if (formData) {
        const updatedForm = {
          ...formData,
          drawingData: stateToRestore,
          timestamp: Date.now(),
        } as FormData
        updateForm(updatedForm)
        setFormData(updatedForm)
      }
    }
  }

  const handleDownload = () => {
    if (canvasRef.current && drawingCanvasRef.current) {
      // Create a temporary canvas to combine the layers
      const tempCanvas = document.createElement("canvas")
      const baseCanvas = canvasRef.current
      const drawingCanvas = drawingCanvasRef.current

      tempCanvas.width = baseCanvas.width
      tempCanvas.height = baseCanvas.height

      const ctx = tempCanvas.getContext("2d")
      if (ctx) {
        // Draw the base layer
        ctx.drawImage(baseCanvas, 0, 0)
        // Draw the drawing layer on top
        ctx.drawImage(drawingCanvas, 0, 0)

        // Get the combined image and trigger download
        const dataUrl = tempCanvas.toDataURL("image/png")
        const link = document.createElement("a")
        link.href = dataUrl
        link.download = `form-${formData?.id || "download"}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingCanvasRef.current) return

    const canvas = drawingCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    if (currentMode === "draw") {
      if (currentTool === "draw") {
        setIsDrawing(true)

        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineWidth = brushSize
          ctx.lineCap = "round"
          ctx.strokeStyle = brushColor
          ctx.globalCompositeOperation = "source-over"
        }
      } else if (currentTool === "eraser") {
        setIsDrawing(true)

        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineWidth = eraserSize
          ctx.lineCap = "round"
          // Use destination-out composite operation for erasing
          ctx.globalCompositeOperation = "destination-out"
        }
      } else if (currentTool === "text") {
        // 获取画布的实际尺寸和显示尺寸比例
        const canvas = drawingCanvasRef.current
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        // 计算实际点击位置
        const x = (e.clientX - rect.left) * scaleX
        const y = (e.clientY - rect.top) * scaleY

        setTextPosition({ x, y })
        setIsAddingText(true)
        setTimeout(() => {
          if (textInputRef.current) {
            textInputRef.current.focus()
          }
        }, 100)
      }
    } else if (currentMode === "upload") {
      // Check if clicked on a blank area
      if (formData?.blankAreas) {
        // Find the clicked blank area
        const clickedBlankArea = formData.blankAreas.find(
          (area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height,
        )

        if (clickedBlankArea) {
          setClickedArea(clickedBlankArea)
          // 不再直接调用fileInputRef.current?.click()，而是显示搜索对话框
          setShowSearchDialog(true)
        }
      }
    }
  }

  // 处理触摸开始事件
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // e.preventDefault()
    if (!drawingCanvasRef.current) return

    const canvas = drawingCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const touch = e.touches[0]
    const x = (touch.clientX - rect.left) * scaleX
    const y = (touch.clientY - rect.top) * scaleY

    if (currentMode === "draw") {
      if (currentTool === "draw") {
        setIsDrawing(true)

        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineWidth = brushSize
          ctx.lineCap = "round"
          ctx.strokeStyle = brushColor
          ctx.globalCompositeOperation = "source-over"
        }
      } else if (currentTool === "eraser") {
        setIsDrawing(true)

        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineWidth = eraserSize
          ctx.lineCap = "round"
          ctx.globalCompositeOperation = "destination-out"
        }
      } else if (currentTool === "text") {
        // 获取画布的实际尺寸和显示尺寸比例
        const canvas = drawingCanvasRef.current
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        // 计算实际点击位置
        const x = (touch.clientX - rect.left) * scaleX
        const y = (touch.clientY - rect.top) * scaleY

        setTextPosition({ x, y })
        setIsAddingText(true)
        setTimeout(() => {
          if (textInputRef.current) {
            textInputRef.current.focus()
          }
        }, 100)
      }
    } else if (currentMode === "upload") {
      // Check if clicked on a blank area
      if (formData?.blankAreas) {
        // Find the clicked blank area
        const clickedBlankArea = formData.blankAreas.find(
          (area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height,
        )

        if (clickedBlankArea) {
          setClickedArea(clickedBlankArea)
          // 不再直接调用fileInputRef.current?.click()，而是显示搜索对话框
          setShowSearchDialog(true)
        }
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !drawingCanvasRef.current || (currentTool !== "draw" && currentTool !== "eraser")) return

    const canvas = drawingCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  // 处理触摸移动事件
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // e.preventDefault()
    if (!isDrawing || !drawingCanvasRef.current || (currentTool !== "draw" && currentTool !== "eraser")) return

    const canvas = drawingCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const touch = e.touches[0]
    const x = (touch.clientX - rect.left) * scaleX
    const y = (touch.clientY - rect.top) * scaleY

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  const handleMouseUp = () => {
    if (isDrawing && (currentTool === "draw" || currentTool === "eraser")) {
      setIsDrawing(false)

      // Reset composite operation after erasing
      if (currentTool === "eraser" && drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext("2d")
        if (ctx) {
          ctx.globalCompositeOperation = "source-over"
        }
      }

      saveDrawingState()
    }
  }

  // 处理触摸结束事件
  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // e.preventDefault()
    if (isDrawing && (currentTool === "draw" || currentTool === "eraser")) {
      setIsDrawing(false)

      // Reset composite operation after erasing
      if (currentTool === "eraser" && drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext("2d")
        if (ctx) {
          ctx.globalCompositeOperation = "source-over"
        }
      }

      saveDrawingState()
    }
  }

  const handleMouseLeave = () => {
    if (isDrawing && (currentTool === "draw" || currentTool === "eraser")) {
      setIsDrawing(false)

      // Reset composite operation after erasing
      if (currentTool === "eraser" && drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext("2d")
        if (ctx) {
          ctx.globalCompositeOperation = "source-over"
        }
      }

      saveDrawingState()
    }
  }

  // 处理触摸取消事件
  const handleTouchCancel = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (isDrawing && (currentTool === "draw" || currentTool === "eraser")) {
      setIsDrawing(false)

      // Reset composite operation after erasing
      if (currentTool === "eraser" && drawingCanvasRef.current) {
        const ctx = drawingCanvasRef.current.getContext("2d")
        if (ctx) {
          ctx.globalCompositeOperation = "source-over"
        }
      }

      saveDrawingState()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !canvasRef.current || !clickedArea) return

    const reader = new FileReader()
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          const canvas = canvasRef.current
          if (!canvas) return

          const ctx = canvas.getContext("2d")
          if (!ctx) return

          const area = clickedArea

          // Clear the area first to prevent image stacking
          ctx.clearRect(area.x, area.y, area.width, area.height)

          if (adaptiveUpload) {
            // Crop and scale the image to fill the area completely
            const sourceAspect = img.width / img.height
            const targetAspect = area.width / area.height

            let sx = 0,
              sy = 0,
              sWidth = img.width,
              sHeight = img.height

            if (sourceAspect > targetAspect) {
              // Image is wider than the target area
              sWidth = img.height * targetAspect
              sx = (img.width - sWidth) / 2
            } else {
              // Image is taller than the target area
              sHeight = img.width / targetAspect
              sy = (img.height - sHeight) / 2
            }

            // Draw the cropped image to fill the area
            ctx.drawImage(img, sx, sy, sWidth, sHeight, area.x, area.y, area.width, area.height)
          } else {
            // Scale the image to fit within the area while maintaining aspect ratio
            const scale = Math.min(area.width / img.width, area.height / img.height)
            const newWidth = img.width * scale
            const newHeight = img.height * scale

            // Center the image in the blank area
            const x = area.x + (area.width - newWidth) / 2
            const y = area.y + (area.height - newHeight) / 2

            ctx.drawImage(img, x, y, newWidth, newHeight)
          }

          // Update the base image
          const updatedBaseImage = canvas.toDataURL("image/png")

          // Save the updated form
          if (formData) {
            const updatedForm = {
              ...formData,
              canvasData: updatedBaseImage,
              timestamp: Date.now(),
              size: new Blob([updatedBaseImage]).size,
            }
            updateForm(updatedForm)
            setFormData(updatedForm)
          }
        }
        img.src = event.target.result
      }
    }
    reader.readAsDataURL(file)
  }

  // 修改更新预览的函数
  const updatePreview = (text: string) => {
    if (!drawingCanvasRef.current || !previewCanvasRef.current) return
    const canvas = drawingCanvasRef.current
    const previewCanvas = previewCanvasRef.current
    const ctx = previewCanvas.getContext("2d")
    if (!ctx) return

    // 设置预览画布尺寸
    previewCanvas.width = canvas.width
    previewCanvas.height = canvas.height

    // 清除预览画布
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
      ctx.drawImage(img, 0, 0)

      // 如果有文本，绘制预览
      if (text) {
        ctx.font = `${textSize}px Arial`
        ctx.fillStyle = textColor
        ctx.globalCompositeOperation = "source-over"
        ctx.fillText(text, textPosition.x, textPosition.y)
      }
    }
    img.src = history[history.length - 1]
  }

  // 修改文本输入处理函数
  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value
    setTextInput(newText)
    // 使用 requestAnimationFrame 来优化预览更新
    requestAnimationFrame(() => {
      updatePreview(newText)
    })
  }

  // 修改关闭文本输入的处理
  const handleCloseTextInput = () => {
    if (!drawingCanvasRef.current || !previewCanvasRef.current) return
    const canvas = drawingCanvasRef.current
    const previewCanvas = previewCanvasRef.current
    const ctx = previewCanvas.getContext("2d")
    if (!ctx) return

    // 清除预览
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = history[history.length - 1]

    setTextInput("")
    setIsAddingText(false)
  }

  // 修改工具切换时的处理
  const handleToolChange = (tool: Tool) => {
    if (isAddingText) {
      handleCloseTextInput()
    }
    setCurrentTool(tool)
    setCurrentMode("draw")
  }

  // 修改模式切换时的处理
  useEffect(() => {
    if (isAddingText) {
      handleCloseTextInput()
    }
  }, [currentMode])

  // 在文本大小或颜色改变时更新预览
  useEffect(() => {
    if (isAddingText && textInput) {
      // 使用 requestAnimationFrame 来优化预览更新
      requestAnimationFrame(() => {
        updatePreview(textInput)
      })
    }
  }, [textSize, textColor])

  // 修改添加文本函数
  const handleAddText = () => {
    if (!textInput || !drawingCanvasRef.current || !previewCanvasRef.current) return

    const canvas = drawingCanvasRef.current
    const previewCanvas = previewCanvasRef.current
    const ctx = canvas.getContext("2d")

    if (ctx) {
      // 将预览内容复制到主画布
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(previewCanvas, 0, 0)

      setTextInput("")
      setIsAddingText(false)
      saveDrawingState()
    }
  }

  // 修改文本位置改变时的处理
  useEffect(() => {
    if (isAddingText && textInput) {
      updatePreview(textInput)
    }
  }, [textPosition])

  // 添加拖放相关的处理函数
  const handleDragEnter = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (hoveredArea) {
      setHoveredArea(null)
      drawHoverOverlay()
    }
  }

  // 修改handleDragOver函数，使用防抖
  const handleDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!isDragging || !formData?.blankAreas || currentMode !== "upload") return

    const canvas = drawingCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // 查找鼠标悬停的空格区域
    const hoveredBlankArea = formData.blankAreas.find(
      (area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height
    )

    // 只在悬停区域发生变化时更新状态
    if (hoveredBlankArea) {
      if (!hoveredArea || 
          hoveredArea.x !== hoveredBlankArea.x || 
          hoveredArea.y !== hoveredBlankArea.y || 
          hoveredArea.width !== hoveredBlankArea.width || 
          hoveredArea.height !== hoveredBlankArea.height) {
        setHoveredArea(hoveredBlankArea)
      }
    } else if (hoveredArea) {
      setHoveredArea(null)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (hoveredArea) {
      setHoveredArea(null)
      drawHoverOverlay()
    }

    if (!formData?.blankAreas || currentMode !== "upload") return

    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return

    const canvas = drawingCanvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // 查找拖放位置的空格区域
    const dropArea = formData.blankAreas.find(
      (area) => x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height
    )

    if (!dropArea) return

    // 处理图片文件
    const reader = new FileReader()
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          const canvas = canvasRef.current
          if (!canvas) return

          const ctx = canvas.getContext("2d")
          if (!ctx) return

          // Clear the area first to prevent image stacking
          ctx.clearRect(dropArea.x, dropArea.y, dropArea.width, dropArea.height)

          if (adaptiveUpload) {
            // Crop and scale the image to fill the area completely
            const sourceAspect = img.width / img.height
            const targetAspect = dropArea.width / dropArea.height

            let sx = 0,
              sy = 0,
              sWidth = img.width,
              sHeight = img.height

            if (sourceAspect > targetAspect) {
              // Image is wider than the target area
              sWidth = img.height * targetAspect
              sx = (img.width - sWidth) / 2
            } else {
              // Image is taller than the target area
              sHeight = img.width / targetAspect
              sy = (img.height - sHeight) / 2
            }

            // Draw the cropped image to fill the area
            ctx.drawImage(img, sx, sy, sWidth, sHeight, dropArea.x, dropArea.y, dropArea.width, dropArea.height)
          } else {
            // Scale the image to fit within the area while maintaining aspect ratio
            const scale = Math.min(dropArea.width / img.width, dropArea.height / img.height)
            const newWidth = img.width * scale
            const newHeight = img.height * scale

            // Center the image in the blank area
            const x = dropArea.x + (dropArea.width - newWidth) / 2
            const y = dropArea.y + (dropArea.height - newHeight) / 2

            ctx.drawImage(img, x, y, newWidth, newHeight)
          }

          // Update the base image
          const updatedBaseImage = canvas.toDataURL("image/png")

          // Save the updated form
          if (formData) {
            const updatedForm = {
              ...formData,
              canvasData: updatedBaseImage,
              timestamp: Date.now(),
              size: new Blob([updatedBaseImage]).size,
            }
            updateForm(updatedForm)
            setFormData(updatedForm)
          }
        }
        img.src = event.target.result
      }
    }
    reader.readAsDataURL(file)
  }

  // 处理选择游戏
  const handleSelectGame = (game: GameSearchResult) => {
    if (!canvasRef.current || !clickedArea) return
    
    // 关闭搜索对话框
    setShowSearchDialog(false)
    
    // 如果游戏有图片，加载图片到画布
    if (game.image) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const area = clickedArea

        // Clear the area first to prevent image stacking
        ctx.clearRect(area.x, area.y, area.width, area.height)

        if (adaptiveUpload) {
          // Crop and scale the image to fill the area completely
          const sourceAspect = img.width / img.height
          const targetAspect = area.width / area.height

          let sx = 0,
            sy = 0,
            sWidth = img.width,
            sHeight = img.height

          if (sourceAspect > targetAspect) {
            // Image is wider than the target area
            sWidth = img.height * targetAspect
            sx = (img.width - sWidth) / 2
          } else {
            // Image is taller than the target area
            sHeight = img.width / targetAspect
            sy = (img.height - sHeight) / 2
          }

          // Draw the cropped image to fill the area
          ctx.drawImage(img, sx, sy, sWidth, sHeight, area.x, area.y, area.width, area.height)
        } else {
          // Scale the image to fit within the area while maintaining aspect ratio
          const scale = Math.min(area.width / img.width, area.height / img.height)
          const newWidth = img.width * scale
          const newHeight = img.height * scale

          // Center the image in the blank area
          const x = area.x + (area.width - newWidth) / 2
          const y = area.y + (area.height - newHeight) / 2

          ctx.drawImage(img, x, y, newWidth, newHeight)
        }

        // Update the base image
        const updatedBaseImage = canvas.toDataURL("image/png")

        // Save the updated form
        if (formData) {
          const updatedForm = {
            ...formData,
            canvasData: updatedBaseImage,
            timestamp: Date.now(),
            size: new Blob([updatedBaseImage]).size,
          }
          updateForm(updatedForm)
          setFormData(updatedForm)
        }
      }
      img.src = game.image
    }
  }

  const renderDrawingToolbar = () => {
    if (currentMode !== "draw") return null

    return (
      <div
        ref={drawingToolbarRef}
        className={cn(
          "bg-white z-50 shadow-md border-b py-2 -mx-4 w-[calc(100%+32px)] sm:w-full sm:mx-0",
          isToolbarFixed ? "fixed top-0 left-0 right-0" : "",
        )}
        style={
          isToolbarFixed
            ? {
                paddingLeft: "max(16px, calc((100% - 1536px) / 2 + 16px))",
                paddingRight: "max(16px, calc((100% - 1536px) / 2 + 16px))",
              }
            : {}
        }
      >
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
            <div className="flex flex-wrap gap-1 sm:gap-2">
              <Button
                variant={currentTool === "draw" ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs sm:text-sm"
                onClick={() => handleToolChange("draw")}
              >
                <Pencil className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                画笔
              </Button>
              <Button
                variant={currentTool === "eraser" ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs sm:text-sm"
                onClick={() => handleToolChange("eraser")}
              >
                <Eraser className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                橡皮
              </Button>
              <Button
                variant={currentTool === "text" ? "default" : "outline"}
                size="sm"
                className="rounded-full text-xs sm:text-sm"
                onClick={() => handleToolChange("text")}
              >
                <Type className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                文本
              </Button>
            </div>

            <div className="flex gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs sm:text-sm h-8 w-8 sm:h-auto sm:w-auto p-0 sm:px-3 sm:py-1"
                onClick={handleUndo}
                disabled={history.length <= 1}
              >
                <Undo className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">撤销</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs sm:text-sm h-8 w-8 sm:h-auto sm:w-auto p-0 sm:px-3 sm:py-1"
                onClick={handleRedo}
                disabled={redoHistory.length === 0}
              >
                <Redo className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
                <span className="hidden sm:inline">还原</span>
              </Button>
            </div>
          </div>

          {currentTool === "draw" && (
            <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-2">
              <div>
                <Label htmlFor="brush-color" className="text-xs sm:text-sm">
                  画笔颜色
                </Label>
                <div className="flex flex-wrap justify-between sm:justify-start sm:gap-3 mt-2 sm:mt-3">
                  {["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#000000", "#FFFFFF"].map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "aspect-square w-[12%] sm:w-9 rounded-full shadow-sm relative transition-all duration-200 hover:scale-105",
                        brushColor === color 
                          ? "transform scale-105 shadow-md" 
                          : "hover:shadow-md",
                        color === "#FFFFFF" ? "border border-gray-300" : "",
                      )}
                      style={{ 
                        backgroundColor: color,
                      }}
                      onClick={() => setBrushColor(color)}
                      aria-label={`选择颜色 ${color}`}
                    >
                      {brushColor === color && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2/5 h-2/5 min-w-[8px] min-h-[6px]">
                            <path 
                              d="M1 4L4.5 7.5L11 1" 
                              stroke={color === "#FFFFFF" || color === "#FFFF00" ? "#000000" : "#FFFFFF"} 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="brush-size" className="text-xs sm:text-sm">
                  画笔粗细: {brushSize}px
                </Label>
                <Slider
                  id="brush-size"
                  min={1}
                  max={20}
                  step={1}
                  value={[brushSize]}
                  onValueChange={(value) => setBrushSize(value[0])}
                  className="mt-1 sm:mt-2"
                />
              </div>
            </div>
          )}

          {currentTool === "eraser" && (
            <div className="mb-2">
              <Label htmlFor="eraser-size" className="text-xs sm:text-sm">
                橡皮粗细: {eraserSize}px
              </Label>
              <Slider
                id="eraser-size"
                min={16}
                max={96}
                step={1}
                value={[eraserSize]}
                onValueChange={(value) => setEraserSize(value[0])}
                className="mt-1 sm:mt-2"
              />
            </div>
          )}

          {currentTool === "text" && (
            <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-2">
              <div>
                <Label htmlFor="text-color" className="text-xs sm:text-sm">
                  文本颜色
                </Label>
                <div className="flex flex-wrap justify-between sm:justify-start sm:gap-3 mt-2 sm:mt-3">
                  {["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#000000", "#FFFFFF"].map((color) => (
                    <button
                      key={color}
                      className={cn(
                        "aspect-square w-[12%] sm:w-9 rounded-full shadow-sm relative transition-all duration-200 hover:scale-105",
                        textColor === color 
                          ? "transform scale-105 shadow-md" 
                          : "hover:shadow-md",
                        color === "#FFFFFF" ? "border border-gray-300" : "",
                      )}
                      style={{ 
                        backgroundColor: color,
                      }}
                      onClick={() => setTextColor(color)}
                      aria-label={`选择颜色 ${color}`}
                    >
                      {textColor === color && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <svg width="12" height="9" viewBox="0 0 12 9" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-2/5 h-2/5 min-w-[8px] min-h-[6px]">
                            <path 
                              d="M1 4L4.5 7.5L11 1" 
                              stroke={color === "#FFFFFF" || color === "#FFFF00" ? "#000000" : "#FFFFFF"} 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="text-size" className="text-xs sm:text-sm">
                  文本大小: {textSize}px
                </Label>
                <Slider
                  id="text-size"
                  min={16}
                  max={96}
                  step={1}
                  value={[textSize]}
                  onValueChange={(value) => setTextSize(value[0])}
                  className="mt-1 sm:mt-2"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <div className="container mx-auto py-6 px-4 text-center">加载中...</div>
  }

  if (!formData) {
    return <div className="container mx-auto py-6 px-4 text-center">表格不存在</div>
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl" ref={containerRef}>
      {isToolbarFixed && currentMode === "draw" && renderDrawingToolbar()}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Link href="/" className="mr-4">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">编辑表格</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="rounded-full" onClick={saveCompleteForm}>
            <Save className="h-4 w-4 mr-2" />
            保存
          </Button>
          <Button
            variant="default"
            size="sm"
            className="rounded-full bg-blue-500 hover:bg-blue-600"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4 mr-2" />
            下载
          </Button>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <div ref={tabsRef} className="w-full mb-4">
          <Tabs
            defaultValue="upload"
            className="w-full tabs-list"
            onValueChange={(value) => {
              setCurrentMode(value as DrawingMode)
              setCurrentTool("draw")
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">
                <Upload className="h-4 w-4 mr-2" />
                填空
              </TabsTrigger>
              <TabsTrigger value="draw">
                <Pencil className="h-4 w-4 mr-2" />
                绘制
              </TabsTrigger>
            </TabsList>

            <TabsContent value="draw" className="mt-4">
              {/* 只在非固定状态下显示工具栏 */}
              {!isToolbarFixed && renderDrawingToolbar()}
            </TabsContent>

            <TabsContent value="upload" className="mt-4">
              <div className="bg-white pb-4 border-b mb-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Switch id="show-blank-areas" checked={showBlankAreas} onCheckedChange={setShowBlankAreas} />
                  <Label htmlFor="show-blank-areas" className="text-xs sm:text-sm">
                    显示填表区域
                  </Label>
                </div>
                <div className="flex items-center space-x-2 mb-4">
                  <Switch id="adaptive-upload" checked={adaptiveUpload} onCheckedChange={setAdaptiveUpload} />
                  <Label htmlFor="adaptive-upload" className="text-xs sm:text-sm">
                    自适应（裁切图片以占满格子）
                  </Label>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* 要有一个和DrawingToolbar等高的占位元素 */}
        {isToolbarFixed && currentMode === "draw" && (
          <div className="toolbar-placeholder" style={{ height: drawingToolbarHeight }}></div>
        )}

        <div className="relative border rounded-lg overflow-hidden max-w-full shadow-lg">
          {/* Base canvas for form and uploaded images */}
          <canvas
            ref={canvasRef}
            className="max-w-full h-auto"
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Drawing canvas for brush strokes and text */}
          <canvas
            ref={drawingCanvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="absolute top-0 left-0 max-w-full h-auto"
            style={{
              cursor:
                currentMode === "upload"
                  ? "pointer"
                  : currentTool === "draw"
                    ? "crosshair"
                    : currentTool === "text"
                      ? "text"
                      : currentTool === "eraser"
                        ? "cell"
                        : "pointer",
            }}
          />

          {/* Overlay canvas for blank areas */}
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 pointer-events-none max-w-full h-auto"
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Hover canvas for hover effect */}
          <canvas
            ref={hoverCanvasRef}
            className="absolute top-0 left-0 pointer-events-none max-w-full h-auto"
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Preview canvas for text input */}
          <canvas
            ref={previewCanvasRef}
            className="absolute top-0 left-0 pointer-events-none max-w-full h-auto"
            style={{
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {isAddingText &&
            drawingCanvasRef.current &&
            (() => {
              const canvas = drawingCanvasRef.current
              const rect = canvas.getBoundingClientRect()
              const scaleX = canvas.width / rect.width
              const scaleY = canvas.height / rect.height

              // 将canvas坐标转换回屏幕坐标
              const screenX = textPosition.x / scaleX
              const screenY = textPosition.y / scaleY

              // 输入框尺寸 - 在移动设备上调整宽度
              const isMobile = window.innerWidth < 640
              const inputWidth = isMobile ? Math.min(rect.width - 20, 150) : 150
              const inputHeight = 40

              // 确保输入框在画布内
              let posX = screenX
              let posY = screenY + 5 // 在点击位置下方显示

              // 防止超出右侧
              if (posX + inputWidth > rect.width - 5) {
                posX = rect.width - inputWidth - 5
              }

              // 防止超出左侧
              if (posX < 5) {
                posX = 5
              }

              // 防止超出底部
              if (posY + inputHeight > rect.height - 5) {
                posY = rect.height - inputHeight - 5
              }

              return (
                <div
                  className="absolute bg-white p-2 rounded shadow-md"
                  style={{
                    left: `${posX}px`,
                    top: `${posY}px`,
                    width: `${inputWidth}px`,
                    zIndex: 1000,
                  }}
                >
                  <div className="flex flex-col sm:flex-row">
                    <input
                      ref={textInputRef}
                      type="text"
                      value={textInput}
                      onChange={handleTextInputChange}
                      className="border rounded px-2 py-1 text-sm w-full"
                      placeholder="输入文本..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddText()
                        } else if (e.key === "Escape") {
                          handleCloseTextInput()
                        }
                      }}
                    />
                    <Button size="sm" className="mt-1 sm:mt-0 sm:ml-2" onClick={handleAddText}>
                      添加
                    </Button>
                  </div>
                </div>
              )
            })()}
        </div>

        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
      </div>

      {/* 添加游戏搜索对话框 */}
      <GameSearchDialog
        isOpen={showSearchDialog}
        onOpenChange={setShowSearchDialog}
        onSelectGame={handleSelectGame}
        onUploadImage={(file) => {
          // 保持原有的文件上传功能
          if (fileInputRef.current) {
            const dataTransfer = new DataTransfer()
            dataTransfer.items.add(file)
            fileInputRef.current.files = dataTransfer.files
            const event = new Event('change', { bubbles: true })
            fileInputRef.current.dispatchEvent(event)
          }
        }}
      />
    </div>
  )
}

