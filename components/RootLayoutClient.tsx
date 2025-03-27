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
        // 发送一个简单的请求，失败也没关系
        await fetch("/api/bangumi-search?q=test&type=4&preheating=true", {
          signal: AbortSignal.timeout(3000), // 3秒超时
        }).catch((e) => {
          console.log("预热请求已结束，无需等待响应")
          // 忽略错误，这里只是为了预热
        })
      } catch (error) {
        // 忽略任何错误
        console.log("预热Bangumi API时出错，但这是预期的，无需担心")
      }
    }

    preheatingBangumiApi()
  }, [])

  return <>{children}</>
} 