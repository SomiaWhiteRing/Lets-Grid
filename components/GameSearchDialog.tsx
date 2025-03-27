"use client"

import { useState, useEffect, useRef } from "react"
import NextImage from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Gamepad2, Loader2, AlertCircle, Search, RefreshCw, Info, Upload, User, UsersRound, BookOpen, Tv, Music, Film } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GameSearchResult, SearchType, CHARACTER_TYPE, PERSON_TYPE } from "@/lib/types"

interface GameSearchDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSelectGame: (game: GameSearchResult) => void
  onUploadImage?: (file: File) => void
}

/**
 * 搜索状态类型
 */
type SearchStatus = {
  state: 'idle' | 'searching' | 'success' | 'error' | 'no-results';
  message: string;
};

/**
 * 搜索模式类型 - 决定是搜索作品还是人物
 */
type SearchMode = 'subject' | 'character';

/**
 * 游戏搜索对话框组件
 */
export function GameSearchDialog({ isOpen, onOpenChange, onSelectGame, onUploadImage }: GameSearchDialogProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<GameSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ 
    state: 'idle', 
    message: '输入名称开始搜索' 
  })
  // 添加状态来跟踪总结果数量
  const [totalResults, setTotalResults] = useState<number>(0)
  // 添加搜索类型状态
  const [searchType, setSearchType] = useState<SearchType>(4) // 默认搜索游戏
  // 添加搜索模式状态 - 作品或人物
  const [searchMode, setSearchMode] = useState<SearchMode>('subject')
  // 添加人物类型状态 - 虚拟角色或现实人物
  const [characterType, setCharacterType] = useState<'character' | 'person'>('character')
  
  // 用于存储搜索请求的 AbortController，以便能取消进行中的请求
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // 上一次搜索的关键词
  const lastSearchTermRef = useRef<string>("");

  // 当对话框打开或关闭时重置状态
  useEffect(() => {
    if (isOpen) {
      // 仅在打开时重置状态，不重置搜索词和结果，以便用户可以继续之前的搜索
      setIsLoading(false);
      setSearchStatus({ 
        state: searchResults.length > 0 ? 'success' : 'idle', 
        message: searchResults.length > 0 ? '' : "输入名称开始搜索" 
      });
    } else {
      // 关闭时取消正在进行的搜索请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen, searchResults.length]);

  // 清空搜索结果和状态
  const handleClearSearch = () => {
    // 取消正在进行的搜索请求
    if (abortControllerRef.current) {
      console.log('清除搜索时取消进行中的搜索请求');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 重置加载状态
    setIsLoading(false);
    
    // 清空搜索内容和结果
    setSearchTerm('');
    setSearchResults([]);
    setTotalResults(0);
    setSearchStatus({ state: 'idle', message: "输入名称开始搜索" });
    lastSearchTermRef.current = '';
  };

  // 处理搜索类型切换
  const handleSearchTypeChange = (value: string) => {
    setSearchType(Number(value) as SearchType);
    // 清空搜索结果，表明发生了切换
    setSearchResults([]);
    setTotalResults(0);
    setSearchStatus({ state: 'idle', message: "输入名称开始搜索" });
    // 不再自动执行搜索
  };

  // 处理搜索模式切换
  const handleSearchModeChange = (value: string) => {
    setSearchMode(value as SearchMode);
    // 清空搜索结果
    setSearchResults([]);
    setTotalResults(0);
    setSearchStatus({ state: 'idle', message: "输入名称开始搜索" });
    // 不再自动执行搜索
  };

  // 处理角色类型切换
  const handleCharacterTypeChange = (value: string) => {
    setCharacterType(value as 'character' | 'person');
    // 清空搜索结果
    setSearchResults([]);
    setTotalResults(0);
    setSearchStatus({ state: 'idle', message: "输入名称开始搜索" });
    // 不再自动执行搜索
  };

  // 搜索游戏 - 使用流式响应
  const searchGames = async (retry: boolean = false) => {
    // 获取搜索词，如果是重试则使用最后一次的搜索词
    const term = retry ? lastSearchTermRef.current : searchTerm.trim();
    
    // 检查搜索词是否为空
    if (!term) {
      setSearchStatus({ state: 'idle', message: '请输入名称' });
      return;
    }
    
    // 取消之前的搜索请求（如果有）
    if (abortControllerRef.current) {
      console.log('取消之前的搜索请求');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const currentAbortController = abortControllerRef.current;
    
    // 更新状态为搜索中
    setIsLoading(true);
    
    // 清除之前的搜索结果，但仅当不是重试的情况下
    if (!retry) {
      setSearchResults([]);
      setTotalResults(0);
    }
    
    setSearchStatus({ state: 'searching', message: '正在搜索...' });
    
    // 保存当前搜索词以便重试
    lastSearchTermRef.current = term;
    
    // 超时定时器
    const timeoutId = setTimeout(() => {
      if (isLoading && currentAbortController === abortControllerRef.current) {
        setSearchStatus({ 
          state: 'searching', 
          message: '正在搜索...' 
        });
      }
    }, 3000);

    try {
      // 构建API端点
      let apiEndpoint;
      if (searchMode === 'subject') {
        apiEndpoint = `/api/bangumi-search?q=${encodeURIComponent(term)}&type=${searchType}`;
      } else {
        // 根据角色类型构建不同的API端点
        apiEndpoint = `/api/bangumi-search?q=${encodeURIComponent(term)}&mode=${characterType}`;
      }
      
      // 使用当前 AbortController 的信号
      const response = await fetch(apiEndpoint, {
        signal: currentAbortController.signal,
        cache: 'no-store'
      });

      // 检查当前操作是否已被更新的请求取代
      if (currentAbortController !== abortControllerRef.current) {
        console.log('搜索请求已被新请求取代');
        return;
      }

      if (!response.ok) {
        throw new Error(`搜索请求失败: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("响应没有正文");
      }

      // 创建一个读取器来处理流数据
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // 临时保存结果的数组
      let games: GameSearchResult[] = [];
      const receivedGames = new Map<string | number, GameSearchResult>();

      let done = false;
      let buffer = "";
      let reachEnd = false;
      
      // 用于控制流处理超时
      const streamTimeoutId = setTimeout(() => {
        if (!reachEnd && currentAbortController === abortControllerRef.current) {
          console.log('流处理超时');
          reader.cancel('Stream processing timeout').catch(console.error);
          
          setSearchStatus({ 
            state: 'error', 
            message: "搜索超时，请重试" 
          });
          
          setIsLoading(false);
          
          if (currentAbortController === abortControllerRef.current) {
            abortControllerRef.current = null;
          }
        }
      }, 15000); // 15秒超时

      // 流式处理部分不变，但添加检查确保当前控制器仍然有效
      while (!done) {
        // 添加检查确保当前控制器仍然有效
        if (currentAbortController !== abortControllerRef.current) {
          console.log('流处理被新请求中断');
          clearTimeout(streamTimeoutId);
          return;
        }
        
        try {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          if (value) {
            buffer += decoder.decode(value, { stream: true });

            // 处理缓冲区中的完整消息
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // 保留最后一个可能不完整的行

            for (const line of lines) {
              if (!line.trim()) continue;

              try {
                const data = JSON.parse(line);

                switch (data.type) {
                  case "init":
                    // 保存服务端返回的总结果数量
                    if (data.total !== undefined) {
                      setTotalResults(data.total);
                      setSearchStatus({ 
                        state: 'searching', 
                        message: `找到 ${data.total} 个结果` 
                      });
                    } else {
                      setSearchStatus({ 
                        state: 'searching', 
                        message: `正在搜索` 
                      });
                    }
                    break;

                  case "gameStart":
                    // 游戏开始加载，添加到结果中（无图片）
                    if (data.game.id !== undefined) {
                      receivedGames.set(data.game.id, data.game);
                    }
                    games = Array.from(receivedGames.values());
                    setSearchResults([...games]);
                    break;

                  case "gameComplete":
                    // 游戏加载完成（有图片），更新结果
                    if (data.game.id !== undefined) {
                      receivedGames.set(data.game.id, data.game);
                    }
                    games = Array.from(receivedGames.values());
                    setSearchResults([...games]);
                    break;

                  case "gameError":
                    console.error(`游戏 ${data.gameId} 加载失败:`, data.error);
                    break;

                  case "error":
                    setSearchStatus({ state: 'error', message: data.message || "搜索失败" });
                    break;

                  case "end":
                    reachEnd = true;
                    clearTimeout(streamTimeoutId);
                    if (games.length > 0) {
                      setSearchStatus({ state: 'success', message: '' });
                    } else {
                      setSearchStatus({ 
                        state: 'no-results', 
                        message: data.message || "未找到相关作品" 
                      });
                    }
                    break;
                }
              } catch (error) {
                console.error("解析响应数据失败:", error, line);
              }
            }
          }
        } catch (readError) {
          console.error("读取流数据失败:", readError);
          throw readError;
        }
      }

      // 如果流结束但没有收到end消息
      if (!reachEnd) {
        clearTimeout(streamTimeoutId);
        if (games.length > 0) {
          setSearchStatus({ state: 'success', message: '' });
        } else {
          setSearchStatus({ state: 'no-results', message: "未找到相关内容" });
        }
      }

    } catch (error) {
      // 检查是否是当前有效的搜索请求
      if (currentAbortController !== abortControllerRef.current) {
        console.log('搜索错误处理被跳过，因为已有新请求');
        return;
      }
      
      // 如果是用户取消的请求，不显示错误
      if ((error as Error).name === 'AbortError') {
        console.log('搜索请求被取消');
        return;
      }

      console.error("搜索失败:", error);
      
      // 简化错误信息
      setSearchStatus({ 
        state: 'error', 
        message: "搜索失败，请重试" 
      });
    } finally {
      // 只有在当前控制器仍然有效的情况下才清理状态
      if (currentAbortController === abortControllerRef.current) {
        clearTimeout(timeoutId);
        setIsLoading(false);
        
        // 清除 AbortController 引用
        abortControllerRef.current = null;
      }
    }
  }

  // 处理回车键搜索
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      searchGames();
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  }

  // 根据当前搜索类型或模式返回适当的图标
  const getIconByType = () => {
    if (searchMode === 'character') {
      return characterType === 'character' ? 
        <User className="h-8 w-8 mb-2 opacity-50" /> : 
        <UsersRound className="h-8 w-8 mb-2 opacity-50" />;
    }
    
    switch (searchType) {
      case 1: // 书籍
        return <BookOpen className="h-8 w-8 mb-2 opacity-50" />;
      case 2: // 动画
        return <Tv className="h-8 w-8 mb-2 opacity-50" />;
      case 3: // 音乐
        return <Music className="h-8 w-8 mb-2 opacity-50" />;
      case 4: // 游戏
        return <Gamepad2 className="h-8 w-8 mb-2 opacity-50" />;
      case 6: // 影视
        return <Film className="h-8 w-8 mb-2 opacity-50" />;
      default:
        return <Gamepad2 className="h-8 w-8 mb-2 opacity-50" />;
    }
  };

  // 渲染搜索状态UI
  const renderSearchStatus = () => {
    switch (searchStatus.state) {
      case 'idle':
        return (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <Search className="h-12 w-12 mb-2 opacity-30" />
            <p>{searchStatus.message || '输入名称开始搜索'}</p>
          </div>
        );
      case 'searching':
        return (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <Loader2 className="h-8 w-8 mb-2 animate-spin" />
            <p>{searchStatus.message}</p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-10 text-red-500">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p>{searchStatus.message}</p>
            <Button 
              variant="outline" 
              className="mt-4" 
              onClick={() => searchGames(true)}
              disabled={isLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重试
            </Button>
          </div>
        );
      case 'no-results':
        return (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            {getIconByType()}
            <p>{searchStatus.message}</p>
            <p className="text-sm mt-2">请尝试不同的关键词</p>
          </div>
        );
      case 'success':
        return null;
      default:
        return null;
    }
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 取消任何进行中的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // 添加文件上传处理函数
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onUploadImage) {
      onUploadImage(file);
      onOpenChange(false); // 上传后关闭弹窗
    }
  };

  // 生成类型名称的辅助函数
  const getTypeName = (type: number): string => {
    switch (type) {
      case 1: return '书籍';
      case 2: return '动画';
      case 3: return '音乐';
      case 4: return '游戏';
      case 6: return '影视';
      default: return '游戏';
    }
  };

  // 获取当前搜索的目标类型名称
  const getSearchTargetName = (): string => {
    if (searchMode === 'subject') {
      return getTypeName(searchType);
    } else {
      return characterType === 'character' ? '虚拟角色' : '现实人物';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto sm:max-w-md md:max-w-lg lg:max-w-xl">
        <DialogHeader>
          <DialogTitle>Bangumi搜索</DialogTitle>
        </DialogHeader>
        
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            {/* 搜索模式选择：作品或人物 */}
            <Select value={searchMode} onValueChange={handleSearchModeChange}>
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="搜索模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject">作品</SelectItem>
                <SelectItem value="character">人物</SelectItem>
              </SelectContent>
            </Select>
            
            {/* 根据搜索模式显示不同的选择器 */}
            {searchMode === 'subject' ? (
              <Select value={String(searchType)} onValueChange={handleSearchTypeChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择作品类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">游戏</SelectItem>
                  <SelectItem value="1">书籍</SelectItem>
                  <SelectItem value="2">动画</SelectItem>
                  <SelectItem value="3">音乐</SelectItem>
                  <SelectItem value="6">影视</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={characterType} onValueChange={handleCharacterTypeChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择人物类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="character">虚拟角色</SelectItem>
                  <SelectItem value="person">现实人物</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`输入${getSearchTargetName()}名称`}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="pr-8"
              />
              {searchTerm && (
                <button 
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={handleClearSearch}
                  aria-label="清除搜索"
                >
                  ✕
                </button>
              )}
            </div>
            <Button onClick={() => searchGames()} disabled={isLoading || !searchTerm.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  搜索中
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  搜索
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="max-h-[40vh] sm:max-h-[300px] md:max-h-[350px] lg:max-h-[400px] overflow-y-auto">
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {searchResults.map((game) => (
                <div
                  key={game.id || game.name}
                  onClick={() => onSelectGame(game)}
                  className="cursor-pointer border rounded p-1 sm:p-2 hover:bg-gray-50 transition-colors"
                  title={`选择 "${game.name}"`}
                >
                  <div className="relative w-full h-0 pb-[133.33%] rounded overflow-hidden bg-gray-100">
                    {game.image ? (
                      <NextImage 
                        src={game.image}
                        alt={game.name} 
                        fill 
                        className="object-cover"
                        sizes="(max-width: 768px) 40vw, 20vw"
                        loading="lazy"
                        onError={(e) => {
                          // 图片加载失败时处理，显示默认图标
                          const imgElement = e.currentTarget as HTMLImageElement;
                          imgElement.style.display = 'none'; // 隐藏失败的图片
                          // 不需要在这里替换，因为我们有备用内容显示
                        }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Gamepad2 className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm truncate mt-1 sm:mt-2">{game.name}</p>
                </div>
              ))}
            </div>
          ) : renderSearchStatus()}
        </div>
        
        <DialogFooter className="flex flex-col sm:flex-row justify-between sm:justify-between border-t pt-2 mt-2">
          <div className="text-xs text-gray-500 mb-2 sm:mb-0">
            {totalResults > 0 && `找到 ${totalResults} 个结果`}
          </div>
          <div className="flex gap-2 w-full sm:w-auto sm:justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
            >
              关闭
            </Button>
            {onUploadImage && (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="image-upload"
                />
                <label
                  htmlFor="image-upload"
                  className="inline-flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 text-white cursor-pointer transition-colors h-9 px-4 py-2 text-sm"
                  title="上传图片"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  上传图片
                </label>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
