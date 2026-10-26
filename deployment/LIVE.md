# 正式服务器

网站入口：<https://39.97.245.13/>

2026-10-26 完成迁移。学生继续使用名单中的学号，已设置的密码保持有效；尚未激活的账号在首次使用时设置密码。新站需重新登录。

迁移核验：79 个账号（含管理员）、2 份个人记录、2 个课程来源逐字段一致；143 页教材图片全部通过原密钥解密，包含第 38 页。手机浏览器已验证旧管理员密码登录、原记录读取、94 页课件及 55 张知识卡片。

## 运行方式

- Ubuntu 24.04，Node.js 24，Nginx；后台仅监听 127.0.0.1:8080。
- 应用目录：`/opt/student-system/current`。
- 数据目录：`/var/lib/student-system`，由 `studyapp` 系统账号管理。
- 私密环境文件：`/etc/student-system.env`，仅 root 可读，勿提交到 GitHub。
- 服务：`student-system.service`，开机启动，失败自动重启。
- HTTPS：Let's Encrypt 的 IP 短期证书。`student-certbot-renew.timer` 每天四次检查续期，失败后重试，续期后重载 Nginx。已通过续期演练。
- 备份：`student-system-backup.timer` 每天服务器时间 03:30 运行，保存 SQLite 在线一致性备份、私密运行配置及上传文件到 `/var/backups/student-system`，仅 root 可读。已验证数据库完整性。当前不自动清理历史备份，需留意磁盘空间；教材静态资源另由部署包保存。

常用维护命令：

```sh
systemctl status student-system nginx --no-pager
systemctl list-timers student-certbot-renew.timer student-system-backup.timer
journalctl -u student-system -n 50 --no-pager
systemctl start student-system-backup.service
```

原站数据库作为迁移前备份保留。运行中的学习记录以新服务器为准。真实名单、原密码验证配置、教材密钥、学习记录及 SSH 私钥均不在公开仓库中。

## GitHub Pages 入口（可选）

`docs/index.html` 是直接跳转到正式服务器的静态入口。若需 GitHub Pages 地址，可在仓库 Settings → Pages 中选择 Deploy from a branch、`main`、`/docs`。这只发布入口页面；登录及记录仍由上述服务器处理。
