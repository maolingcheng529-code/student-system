# 独立服务器部署

这是可在 Node.js 24 上直接运行的完整后端适配器，复用原有登录、权限、资料检索和学习记录接口。SQLite 数据库和上传文件保存在私有数据目录，不使用 GitHub Pages 运行后端。

本目录提供新独立后端的部署准备，不代表已将旧站点的数据无损迁移，也不代表已获得可访问的新域名。

## 运行前

- 准备 Linux 服务器、Docker Engine 和 Compose 插件。
- 准备实际域名，将 DNS 指向服务器，允许公网访问 TCP 80/443。Caddy 为此域名申请并续期 HTTPS 证书；域名示例不能直接使用。
- 所有会话 Cookie 保持 `__Host-`、`Secure` 和 `HttpOnly`。公网纯 HTTP IP 地址不是可用的登录入口。
- 在仓库根目录创建 `private/`，其中 `secrets.env`、`roster.json`、`data/` 和 `textbook-assets/` 必须保密，不要上传至公开仓库。

## 私有配置

1. 复制 `deployment/env.example` 为 `deployment/.env`，填实际域名及独立随机的 `TRUST_PROXY_SECRET`。它用于反向代理向后端证明客户端 IP 的来源，不能复用管理员密码。
2. 复制 `deployment/secrets.example.env` 为 `private/secrets.env`，私下填 `AUTH_PEPPER`、`ADMIN_PASSWORD_HASH`、`TEXTBOOK_IMAGE_KEY`。
3. `ADMIN_PASSWORD_HASH` 使用项目 `lib/password.mjs` 的 `hashPassword` 生成。把完整散列放在单引号内，保留其中的 `$`，避免 Compose 将其当成环境变量展开。不要把明文管理员密码写入配置；不要在 shell 命令参数中传密码。
4. 将生产学生名单放到 `private/roster.json`。它会以只读挂载覆盖镜像中的演示名单。格式与 `lib/roster.json` 相同；正式服务不能使用公开演示名单。
5. 将与私有 `TEXTBOOK_IMAGE_KEY` 配套的 143 个 `.bin` 教材文件放到 `private/textbook-assets/`。随机生成新密钥不能解开旧图片。
6. 创建 `private/data/`，让容器用户 UID/GID 1000 可读写此目录，并让同一用户可读取只读挂载的 `private/roster.json`、`private/textbook-assets/`。SQLite 和资料上传文件保存在数据目录中。目录不要映射为任何静态网站目录；包含秘密值的 env 文件只需部署管理员和 Docker 读取，不需授予其他普通用户读取权限。

从仓库根目录启动：

```sh
docker compose --env-file deployment/.env -f deployment/compose.yaml up -d --build
docker compose --env-file deployment/.env -f deployment/compose.yaml ps
```

启动时按顺序执行 `drizzle/` 下的数据库迁移，记录迁移摘要。已应用的迁移被改动时会拒绝启动。升级前请停止写入并备份 `private/data/`，同时保留原有秘密配置和图片。不要仅复制 SQLite 主文件而忽略运行中的 WAL 文件。

## 现有数据迁移

迁移工具只接受包含 `users`、`learning_state`、`course_sources`、`documents` 的 JSON 对象，每个字段为数据库行数组。会校验列白名单和外键，并在事务中导入。目标数据库必须为空，不覆盖已有用户、学习记录或文件。

必须使用完整数据库导出。带 `truncated`、`truncated_values` 或 `model_projection` 标识的工具展示结果、被截断的 JSON 文本不能作为迁移数据；导入器会拒绝这些内容。只看到部分表格内容不能证明备份完整。

`sessions` 和 `auth_limits` 不迁移；用户需重新登录。启用账号的密码散列必须配合原来的 `AUTH_PEPPER` 才能验证。工具不会清空或重置学生密码；原 pepper 不可用时，不能声称旧密码能够继续使用。

```sh
node deployment/import-data.mjs --file private/export.json --data-dir private/data
```

如果导入数据含已激活用户，只有在已确认保留原 pepper 时才加 `--same-auth-pepper`。有上传文件时，另加 `--objects-dir private/old-store`；对应文件应放在 `private/old-store/objects/materials/<document-id>`，大小须与数据库一致。没有原始文件时不导入对应文档记录。若导入命令由 root 执行，导入后需再次将 `private/data/` 的文件归属设置为容器 UID/GID 1000，确保应用能够继续写入。

## 无容器运行与检查

后端不依赖 npm 第三方包。可以在设置好上述秘密环境变量后运行：

```sh
node deployment/server.mjs
node --test deployment/smoke.test.mjs
```

默认只监听 `127.0.0.1:8080`。正式部署设置 `PUBLIC_ORIGIN=https://你的实际域名`；需要容器内部访问时设置 `HOST=0.0.0.0`。反向代理必须传递共享秘密及真实客户端地址，不能将应用端口公开暴露。应用不会信任客户端自行提交的 `CF-Connecting-IP`、`X-Forwarded-*` 等头。

这套配置适用于单台服务器。多台副本不能共享 SQLite 文件作为分布式数据库。外部 GitHub 课件链接、外部图示或视频仍取决于其来源服务的可访问性；系统内已导入的正文、教材和 OCR 资源由自己的服务器提供。
