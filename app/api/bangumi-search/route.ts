import { NextRequest, NextResponse } from "next/server";
import { GameSearchResult } from "@/lib/types";

// 默认的封面URL前缀
const IMAGE_PREFIX = "https://lain.bgm.tv/pic/cover/";

// 请求重试函数
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  delay = 500
) {
  let lastError;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      console.log(`API请求失败，正在重试 (${i + 1}/${retries + 1})...`);

      if (i < retries) {
        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, delay));
        // 每次重试增加延迟
        delay *= 1.5;
      }
    }
  }

  throw lastError;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const type = searchParams.get("type") ?? "4"; // 默认搜索游戏类型

  // 检查是否是预热请求
  const isPreheating = query === "test" && searchParams.has("preheating");

  if (!query) {
    return NextResponse.json({ error: "搜索关键词不能为空" }, { status: 400 });
  }

  // 创建一个新的TransformStream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // 发送初始化消息到客户端
  const sendInitMessage = async () => {
    await writer.write(encoder.encode(JSON.stringify({ type: "init" }) + "\n"));
  };

  // 发送错误消息到客户端
  const sendErrorMessage = async (message: string) => {
    await writer.write(
      encoder.encode(JSON.stringify({ type: "error", message }) + "\n")
    );
  };

  // 获取本地图片代理URL
  const getProxyImageUrl = (originalUrl: string) => {
    // 不使用request.url获取origin，因为它可能是localhost而实际访问是其他IP
    // 直接使用相对路径，让浏览器根据当前域名解析
    return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
  };

  // 发送游戏数据到客户端
  const sendGameData = async (game: GameSearchResult) => {
    // 先发送游戏开始加载的信息
    await writer.write(
      encoder.encode(JSON.stringify({ type: "gameStart", game }) + "\n")
    );

    // 如果没有图片，尝试获取图片
    if (!game.image && game.id) {
      try {
        // 构造原始图片URL
        const originalImageUrl = `${IMAGE_PREFIX}l/${game.id}.jpg`;
        // 使用代理图片URL
        const proxyImageUrl = getProxyImageUrl(originalImageUrl);

        // 发送完整游戏信息（包括图片）
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "gameComplete",
              game: {
                ...game,
                image: proxyImageUrl,
              },
            }) + "\n"
          )
        );
      } catch (error) {
        console.error(`获取游戏 ${game.id} 图片失败:`, error);
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "gameError",
              gameId: game.id,
              error: "获取图片失败",
            }) + "\n"
          )
        );
      }
    } else if (game.image) {
      // 已有图片的情况下，将原始图片URL转换为代理URL
      try {
        // 使用代理图片URL
        const proxyImageUrl = getProxyImageUrl(game.image);

        // 发送完整游戏信息（包括代理图片URL）
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "gameComplete",
              game: {
                ...game,
                image: proxyImageUrl,
              },
            }) + "\n"
          )
        );
      } catch (error) {
        console.error(`处理游戏 ${game.id} 图片代理失败:`, error);
        // 如果代理URL处理失败，仍然发送原始数据
        await writer.write(
          encoder.encode(JSON.stringify({ type: "gameComplete", game }) + "\n")
        );
      }
    } else {
      // 没有图片的情况，直接发送完整信息
      await writer.write(
        encoder.encode(JSON.stringify({ type: "gameComplete", game }) + "\n")
      );
    }
  };

  // 发送结束消息到客户端
  const sendEndMessage = async (message?: string) => {
    await writer.write(
      encoder.encode(JSON.stringify({ type: "end", message }) + "\n")
    );
    await writer.close();
  };

  // 主流程
  const doSearch = async () => {
    try {
      await sendInitMessage();

      // 预热请求直接返回
      if (isPreheating) {
        console.log("预热请求已处理");
        return await sendEndMessage("预热请求已处理");
      }

      // 构建Bangumi API URL
      const apiUrl = `https://api.bgm.tv/search/subject/${encodeURIComponent(
        query
      )}?type=${type}&responseGroup=small`;

      // 使用重试机制发送请求
      const response = await fetchWithRetry(
        apiUrl,
        {
          headers: {
            "User-Agent":
              "LetsGrid/1.0 (https://github.com/username/lets-grid)",
          },
          // 设置较短的超时时间
          signal: AbortSignal.timeout(8000),
        },
        2 // 最多重试2次
      );

      if (!response.ok) {
        throw new Error(`Bangumi API 响应错误: ${response.status}`);
      }

      const data = await response.json();

      if (data && data.list && Array.isArray(data.list)) {
        // 发送总结果数
        await writer.write(
          encoder.encode(
            JSON.stringify({ type: "init", total: data.results }) + "\n"
          )
        );

        // 处理每个游戏的信息
        for (const item of data.list) {
          const game: GameSearchResult = {
            id: item.id,
            name: item.name_cn || item.name,
            info: item.summary,
            type: item.type,
            image: item.images?.common || item.images?.medium || null,
          };

          await sendGameData(game);
        }

        if (data.list.length === 0) {
          await sendEndMessage("未找到相关内容");
        } else {
          await sendEndMessage();
        }
      } else {
        await sendEndMessage("未找到相关内容");
      }
    } catch (error) {
      console.error("搜索失败:", error);

      // 给用户更友好的错误提示
      let errorMessage = "搜索失败，请稍后重试";
      if (error instanceof TypeError && error.message.includes("fetch")) {
        errorMessage = "网络连接失败，请检查您的网络连接";
      } else if (error instanceof Error && error.name === "AbortError") {
        errorMessage = "搜索超时，请稍后重试";
      } else if (error instanceof Error && error.message.includes("404")) {
        errorMessage = "API服务未找到，请稍后重试";
      } else if (error instanceof Error && error.message.includes("429")) {
        errorMessage = "请求过于频繁，请稍后重试";
      } else if (error instanceof Error && error.message.includes("5")) {
        errorMessage = "API服务暂时不可用，请稍后重试";
      }

      await sendErrorMessage(errorMessage);
      await sendEndMessage();
    }
  };

  // 异步执行搜索
  doSearch().catch(async (error) => {
    console.error("处理搜索流时出错:", error);
    try {
      await sendErrorMessage("内部服务器错误，请稍后重试");
      await writer.close();
    } catch (e) {
      console.error("关闭流时出错:", e);
    }
  });

  // 返回流式响应
  return new Response(stream.readable, {
    headers: {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
