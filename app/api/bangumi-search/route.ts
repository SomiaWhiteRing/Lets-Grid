import { NextRequest, NextResponse } from "next/server";
import { GameSearchResult, CHARACTER_TYPE, PERSON_TYPE } from "@/lib/types";

// Bangumi API Access Token
const BANGUMI_ACCESS_TOKEN = process.env.BANGUMI_ACCESS_TOKEN;
// Bangumi API User Agent
const BANGUMI_USER_AGENT =
  process.env.BANGUMI_USER_AGENT ||
  "LetsGrid/1.0 (https://github.com/SomiaWhiteRing/Lets-Grid)";

// 默认的封面URL前缀
const IMAGE_PREFIX = "https://lain.bgm.tv/pic/cover/";
// 角色图片前缀
const CHARACTER_PREFIX = "https://lain.bgm.tv/pic/crt/";
// 人物图片前缀
const PERSON_PREFIX = "https://lain.bgm.tv/pic/crt/";

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

// 全局变量，记录上次预热时间
let lastPreheatingTime = 0;
// 预热有效期，5分钟
const PREHEATING_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const type = searchParams.get("type") ?? "4"; // 默认搜索游戏类型
  // 新增：搜索模式参数，默认为作品搜索
  const mode = searchParams.get("mode");

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
    try {
      // 先发送游戏开始加载的信息（使用原始URL，不使用代理）
      await writer.write(
        encoder.encode(JSON.stringify({ type: "gameStart", game }) + "\n")
      );

      // 如果没有图片，尝试获取图片
      if (!game.image && game.id) {
        try {
          // 构造原始图片URL（根据搜索模式选择不同的图片前缀）
          let imagePrefix = IMAGE_PREFIX;
          if (mode === "character") {
            imagePrefix = CHARACTER_PREFIX;
          } else if (mode === "person") {
            imagePrefix = PERSON_PREFIX;
          }

          const originalImageUrl = `${imagePrefix}l/${game.id}.jpg`;

          // 保存原始URL，但不转换为代理URL（仅在UI渲染时使用原始URL）
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: "gameComplete",
                game: {
                  ...game,
                  image: originalImageUrl,
                  originalImage: originalImageUrl, // 添加原始图片URL字段
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
        // 已有图片的情况，保存原始URL
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "gameComplete",
              game: {
                ...game,
                originalImage: game.image, // 添加原始图片URL字段
              },
            }) + "\n"
          )
        );
      } else {
        // 没有图片的情况，直接发送完整信息
        await writer.write(
          encoder.encode(JSON.stringify({ type: "gameComplete", game }) + "\n")
        );
      }
    } catch (error) {
      console.error(`处理游戏 ${game.id} 数据失败:`, error);
      // 发送错误信息
      await writer.write(
        encoder.encode(
          JSON.stringify({
            type: "gameError",
            gameId: game.id,
            error: "处理游戏数据失败",
          }) + "\n"
        )
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

  // 执行对Bangumi API的预热请求
  const executeBangumiApiPreheating = async () => {
    try {
      // 访问一个轻量级的API端点，以保持连接活跃
      const apiUrl = `https://api.bgm.tv/search/subject/test?type=4&responseGroup=small`;
      console.log("预热: 正在连接Bangumi API...");

      // 执行实际API调用
      const response = await fetchWithRetry(
        apiUrl,
        {
          method: "GET",
          headers: {
            "User-Agent": BANGUMI_USER_AGENT,
            "Content-Type": "application/json",
            ...(BANGUMI_ACCESS_TOKEN && {
              Authorization: `Bearer ${BANGUMI_ACCESS_TOKEN}`,
            }),
          },
          // 预热请求使用较短的超时时间
          signal: AbortSignal.timeout(5000),
        },
        1 // 最多重试1次
      );

      // 记录预热时间
      lastPreheatingTime = Date.now();

      console.log(`预热: Bangumi API连接成功，HTTP状态: ${response.status}`);
      return true;
    } catch (error) {
      console.error("预热: Bangumi API连接失败:", error);
      return false;
    }
  };

  // 主流程
  const doSearch = async () => {
    try {
      await sendInitMessage();

      // 如果是预热请求，执行预热逻辑
      if (isPreheating) {
        console.log("收到预热请求，开始预热Bangumi API");

        // 执行实际的API预热
        const preheatingSuccess = await executeBangumiApiPreheating();

        if (preheatingSuccess) {
          return await sendEndMessage("预热成功，API连接已建立");
        } else {
          return await sendEndMessage("预热尝试完成，但API连接未成功建立");
        }
      }

      // 检查是否需要执行预热（如果距离上次预热已超过有效期）
      const now = Date.now();
      const needsPreheating = now - lastPreheatingTime > PREHEATING_TTL;

      if (needsPreheating) {
        console.log("API连接可能已过期，尝试重新预热");
        // 后台执行预热，不等待结果
        executeBangumiApiPreheating().catch((e) =>
          console.error("后台预热失败:", e)
        );
      }

      // 构建Bangumi API URL
      let apiUrl;
      let apiMethod = "GET";
      let apiBody;

      if (mode === "character" || mode === "person") {
        // 使用v0 API的角色或人物搜索
        apiUrl = `https://api.bgm.tv/v0/search/${
          mode === "character" ? "characters" : "persons"
        }`;
        apiMethod = "POST";
        apiBody = JSON.stringify({
          keyword: query,
          filter: {},
        });
      } else {
        // 默认使用旧版API搜索作品
        apiUrl = `https://api.bgm.tv/search/subject/${encodeURIComponent(
          query
        )}?type=${type}&responseGroup=small`;
      }

      // 使用重试机制发送请求
      const response = await fetchWithRetry(
        apiUrl,
        {
          method: apiMethod,
          headers: {
            "User-Agent": BANGUMI_USER_AGENT,
            "Content-Type": "application/json",
            ...(BANGUMI_ACCESS_TOKEN && {
              Authorization: `Bearer ${BANGUMI_ACCESS_TOKEN}`,
            }),
          },
          body: apiBody,
          // 设置较短的超时时间
          signal: AbortSignal.timeout(8000),
        },
        2 // 最多重试2次
      );

      if (!response.ok) {
        throw new Error(`Bangumi API 响应错误: ${response.status}`);
      }

      const data = await response.json();

      if (mode === "character" || mode === "person") {
        // 处理角色/人物搜索结果格式
        if (data && data.data && Array.isArray(data.data)) {
          // 发送总结果数
          await writer.write(
            encoder.encode(
              JSON.stringify({
                type: "init",
                total: data.total || data.data.length,
              }) + "\n"
            )
          );

          // 处理每个角色/人物的信息
          for (const item of data.data) {
            // 基本信息
            const characterId = item.id;
            const name =
              mode === "character"
                ? item.name || (item.names ? item.names[0] : "")
                : item.name ||
                  (item.names && item.names.zh ? item.names.zh : "");

            // 构造图片URL（角色用大图，人物用小图）
            const imageSize = mode === "character" ? "l" : "m";
            // 不再将原始URL转为代理URL
            const imageUrl =
              item.images?.large ||
              (mode === "character"
                ? `${CHARACTER_PREFIX}${imageSize}/${characterId}.jpg`
                : `${PERSON_PREFIX}${imageSize}/${characterId}.jpg`);

            const game: GameSearchResult = {
              id: characterId,
              name: name,
              image: imageUrl, // 使用原始URL，不转代理
              originalImage: imageUrl, // 添加原始图片URL字段
              type: mode === "character" ? CHARACTER_TYPE : PERSON_TYPE,
            };

            await sendGameData(game);
          }

          if (data.data.length === 0) {
            await sendEndMessage("未找到相关角色");
          } else {
            await sendEndMessage();
          }
        } else {
          await sendEndMessage("未找到相关角色");
        }
      } else {
        // 处理旧版API的作品搜索结果格式
        if (data && data.list && Array.isArray(data.list)) {
          // 发送总结果数
          await writer.write(
            encoder.encode(
              JSON.stringify({ type: "init", total: data.results }) + "\n"
            )
          );

          // 处理每个作品的信息
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
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
