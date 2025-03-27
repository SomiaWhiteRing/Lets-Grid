# LetsGrid - 万能填表器

这里应该有个说明但是我不知道写啥好谁来给我个pr

## 快速开始

克隆仓库并安装依赖项：

```bash
git clone https://github.com/yourusername/lets-grid.git
cd lets-grid
yarn
```

运行开发服务器：

```bash
yarn dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 环境变量

创建`.env.local`文件，添加以下配置：

```bash
# Bangumi API配置
BANGUMI_ACCESS_TOKEN=your_bangumi_access_token
BANGUMI_USER_AGENT=your_user_agent
```

### API密钥获取方式

- **Bangumi Access Token**:
  1. 访问 [Bangumi API](https://bangumi.github.io/api/#/%E6%9D%A1%E7%9B%AE/getCalendar)
  2. 登录并创建应用
  3. 获取 Access Token
  4. 设置合适的 User Agent（参考[bangumiUA指南](https://github.com/bangumi/api/blob/master/docs-raw/user%20agent.md)）

## 开发历程


## 致谢

- 本项目使用 [Cursor](https://cursor.sh/) 辅助开发，提高了开发效率和~降低了~代码质量。
- 感谢 [Bangumi](https://bgm.tv/) 提供的API支持。
- 感谢 [Vercel](https://vercel.com/) 提供的云服务。

## 许可证

MIT许可证 - 详情请参阅[LICENSE](LICENSE)文件
