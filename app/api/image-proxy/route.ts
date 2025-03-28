import { NextRequest } from "next/server";

// Bangumi API Access Token
const BANGUMI_ACCESS_TOKEN = process.env.BANGUMI_ACCESS_TOKEN;
// Bangumi API User Agent
const BANGUMI_USER_AGENT =
  process.env.BANGUMI_USER_AGENT ||
  "LetsGrid/1.0 (https://github.com/SomiaWhiteRing/Lets-Grid)";

// 判断URL是否合法的函数
function isValidImageUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // 只允许从bangumi的图片服务器获取图片
    return (
      urlObj.hostname === "lain.bgm.tv" &&
      (urlObj.pathname.startsWith("/pic/cover/") ||
        urlObj.pathname.startsWith("/pic/crt/"))
    );
  } catch (e) {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 获取图片URL参数
    const searchParams = request.nextUrl.searchParams;
    const imageUrl = searchParams.get("url");

    // 检查图片URL是否存在
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "缺少图片URL参数" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // 验证图片URL是否合法
    if (!isValidImageUrl(imageUrl)) {
      return new Response(
        JSON.stringify({ error: "图片URL不合法或不在允许范围内" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // 请求原始图片
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": BANGUMI_USER_AGENT,
          Referer: "https://bgm.tv/",
          Authorization: `Bearer ${BANGUMI_ACCESS_TOKEN}`,
        },
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      // 处理可能的404或其他错误
      if (!response.ok) {
        // 如果是404或其他错误，返回空图片数据
        if (response.status === 404) {
          // 生成一个1x1像素的透明PNG数据
          const transparentPixel = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
            0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
            0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
            0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63,
            0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
            0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60,
            0x82,
          ]);

          return new Response(transparentPixel, {
            status: 200,
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }

        return new Response(
          JSON.stringify({ error: `图片加载失败: ${response.status}` }),
          {
            status: response.status,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }

      // 获取图片数据
      const imageBuffer = await response.arrayBuffer();

      // 获取原始图片的MIME类型
      const contentType = response.headers.get("content-type") || "image/jpeg";

      // 返回代理后的图片
      return new Response(imageBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400", // 缓存一天
        },
      });
    } catch (error: any) {
      clearTimeout(timeoutId);

      // 处理请求超时或网络错误
      if (error.name === "AbortError") {
        return new Response(JSON.stringify({ error: "图片加载超时" }), {
          status: 408,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      throw error;
    }
  } catch (error) {
    console.error("图片代理错误:", error);

    return new Response(JSON.stringify({ error: "服务器内部错误" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
