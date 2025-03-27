"use client"

import { useEffect } from "react"

export default function RootLayoutClient({
  children,
}: {
  children: React.ReactNode
}) {
  // 应用启动时预热Bangumi API
  useEffect(() => {
    const preheatingBangumiApi = async () => {
      try {
        console.log("正在预热Bangumi API...")
        // 发送一个预热请求，设置更长的超时时间
        await fetch("/api/bangumi-search?q=test&type=4&preheating=true", {
          signal: AbortSignal.timeout(10000), // 10秒超时，确保有足够时间完成预热
          method: "GET",
          // 确保请求头与实际搜索请求一致
          headers: {
            "Content-Type": "application/json",
          },
        })
        console.log("预热请求已完成")
      } catch (error) {
        // 记录错误但不影响用户体验
        console.log("预热Bangumi API时出错:", error)
      }
    }

    // 延迟一秒后执行预热，确保应用已完全加载
    const timer = setTimeout(() => {
      preheatingBangumiApi()
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [])

  return <>{children}</>
} 