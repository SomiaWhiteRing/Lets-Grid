import { NextRequest, NextResponse } from "next/server";
import { GameSearchResult } from "@/lib/types";

// 默认的封面URL前缀
const IMAGE_PREFIX = "https://lain.bgm.tv/pic/cover/";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const type = searchParams.get("type") ?? "4"; // 默认搜索游戏类型

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

  // 发送游戏数据到客户端
  const sendGameData = async (game: GameSearchResult) => {
    // 先发送游戏开始加载的信息
    await writer.write(
      encoder.encode(JSON.stringify({ type: "gameStart", game }) + "\n")
    );

    // 如果没有图片，尝试获取图片
    if (!game.image && game.id) {
      try {
        // 发送完整游戏信息（包括图片）
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "gameComplete",
              game: {
                ...game,
                image: `${IMAGE_PREFIX}l/${game.id}.jpg`,
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
    } else {
      // 已有图片的情况下直接发送完整信息
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

      // 构建Bangumi API URL
      const apiUrl = `https://api.bgm.tv/search/subject/${encodeURIComponent(
        query
      )}?type=${type}&responseGroup=small`;

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "LetsGrid/1.0 (https://github.com/username/lets-grid)",
        },
      });

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
            source: "bangumi",
            image: item.images?.common || item.images?.medium || null,
          };

          await sendGameData(game);
        }

        if (data.list.length === 0) {
          await sendEndMessage("未找到相关游戏");
        } else {
          await sendEndMessage();
        }
      } else {
        await sendEndMessage("未找到相关游戏");
      }
    } catch (error) {
      console.error("搜索游戏失败:", error);
      await sendErrorMessage("搜索失败，请检查网络连接后重试");
      await sendEndMessage();
    }
  };

  // 异步执行搜索
  doSearch().catch(async (error) => {
    console.error("处理搜索流时出错:", error);
    try {
      await sendErrorMessage("内部服务器错误");
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
