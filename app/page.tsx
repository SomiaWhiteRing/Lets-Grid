"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { PlusCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { initDB, getAllForms, deleteForm } from "@/lib/db"
import { Progress } from "@/components/ui/progress"
import { detectBlankAreas } from "@/lib/image-analysis"

interface FormItem {
  id: string
  imageData: string
  timestamp: number
  size: number
}

export default function HomePage() {
  const [forms, setForms] = useState<FormItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingStep, setProcessingStep] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update the initialize function to handle errors better
  useEffect(() => {
    const initialize = async () => {
      try {
        await initDB()
        loadForms()
      } catch (error) {
        console.error("Failed to initialize database:", error)
        // Retry initialization after a short delay
        setTimeout(initialize, 500)
      }
    }

    initialize()
  }, [])

  const loadForms = async () => {
    setIsLoading(true)
    try {
      const formsList = await getAllForms()
      setForms(formsList)
    } catch (error) {
      console.error("Failed to load forms:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteForm(id)
      setForms(forms.filter((form) => form.id !== id))
    } catch (error) {
      console.error("Failed to delete form:", error)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    else return (bytes / (1024 * 1024)).toFixed(2) + " MB"
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  // Update the handleAddNew function to ensure DB is initialized
  const handleAddNew = () => {
    fileInputRef.current?.click()
  }

  // Update the handleFileChange function to show processing progress
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setProcessingProgress(0)
    setProcessingStep("初始化...")

    try {
      // Step 1: Read the file
      setProcessingStep("读取文件...")
      setProcessingProgress(10)

      const imageData = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          if (typeof event.target?.result === "string") {
            resolve(event.target.result)
          }
        }
        reader.readAsDataURL(file)
      })

      // Step 2: Ensure DB is initialized
      setProcessingStep("初始化数据库...")
      setProcessingProgress(30)

      const { saveForm, ensureDBInitialized } = await import("@/lib/db")
      await ensureDBInitialized()

      // Generate a unique ID for the new form
      const id = Date.now().toString()

      // Step 3: Analyze blank areas
      setProcessingStep("分析表格空白区域...")
      setProcessingProgress(50)

      const blankAreas = await detectBlankAreas(imageData, true)

      // Step 4: Save the form data
      setProcessingStep("保存表格数据...")
      setProcessingProgress(80)

      // Save the initial form data
      const formData = {
        id,
        imageData,
        canvasData: null,
        drawingData: null,
        timestamp: Date.now(),
        size: new Blob([imageData]).size,
        blankAreas,
      }

      await saveForm(formData)

      setProcessingProgress(100)
      setProcessingStep("完成！正在跳转...")

      // Navigate to the edit page
      setTimeout(() => {
        window.location.href = `/edit/${id}`
      }, 500)
    } catch (error) {
      console.error("Failed to process form:", error)
      alert("处理表格时出错，请重试。")
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl min-h-screen flex flex-col relative pb-48">
      <h1 className="text-3xl font-bold mb-8 text-center">万能填表器</h1>

      {isProcessing ? (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <h2 className="text-xl font-semibold mb-4">处理表格中...</h2>
          <p className="mb-2">{processingStep}</p>
          <Progress value={processingProgress} className="h-2 mb-4" />
          <p className="text-sm text-muted-foreground">请稍候，正在处理您的表格...</p>
        </div>
      ) : (
        <div className="grid gap-4 mb-8">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors border-dashed" onClick={handleAddNew}>
            <CardContent className="flex items-center justify-center p-6">
              <div className="flex flex-col items-center gap-2">
                <PlusCircle className="h-10 w-10 text-primary" />
                <span className="font-medium">点击此处添加新表！</span>
              </div>
            </CardContent>
          </Card>

          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

          {isLoading ? (
            <div className="text-center py-10">加载中...</div>
          ) : forms.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">没有保存的表格。点击"添加新表"开始创建。</div>
          ) : (
            forms.map((form) => (
              <Link href={`/edit/${form.id}`} key={form.id} passHref>
                <Card className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardContent className="p-0">
                    <div className="flex items-center">
                      <div className="w-24 h-24 shrink-0">
                        <img
                          src={form.imageData || "/placeholder.svg"}
                          alt="表格预览"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 p-4">
                        <div className="text-sm">{formatDate(form.timestamp)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{formatSize(form.size)}</div>
                      </div>
                      <div className="p-4">
                        <div className="flex gap-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-full"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (confirm("确定要删除此表格吗？此操作不可恢复。")) {
                                handleDelete(form.id)
                              }
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      )}
      
      <footer className="fixed bottom-0 left-0 right-0 py-4 border-t bg-white/95 backdrop-blur-sm">
        <div className="text-sm text-gray-500 text-center max-w-3xl mx-auto px-4">
          <p className="flex items-center justify-center mb-1">
          如果觉得对你有用请不吝→
          <a 
            href="https://github.com/SomiaWhiteRing/gamegrid" 
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 inline-flex items-center"
          >
            <img 
              src="https://img.shields.io/github/stars/SomiaWhiteRing/lets-grid?style=social" 
              alt="GitHub Stars" 
              className="align-middle"
            />
          </a>
        </p>
        <p className="flex items-center justify-center">
          <a className="text-blue-500 mr-1" href="https://weibo.com/6571509464/Phs2X0DIy">苍旻白轮</a> Powered by Vercel & Bangumi
        </p>
        <p className="flex items-center justify-center mt-1">
          前作(?)：<a className="text-blue-500" href="https://gamegrid.shatranj.space/">游戏生涯个人喜好表</a>
        </p>
        <p className="flex items-center justify-center mt-1">
          <a 
            href="https://hits.sh/github.com/SomiaWhiteRing/Lets-Grid/"
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <img 
              src="https://hits.sh/github.com/SomiaWhiteRing/Lets-Grid.svg?label=visitors&color=007ec6"
              alt="Visitors Count"
              className="align-middle"
            />
          </a>
        </p>
        </div>
      </footer>
    </div>
  )
}

