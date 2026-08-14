# mp 部署指南(阿里云 ECS + Docker Compose)

单机部署形态:`web`(nginx 静态托管 + 反代)+ `backend`(Fastify + SQLite)两个容器,
数据持久化在 Docker 卷 `mp-data`。全流程约 30 分钟(不含备案等待期)。

```
公网用户 → ECS 安全组(仅 22/80/443)
              │
        nginx 容器(web)
        ├─ 托管前端静态文件(SPA)
        ├─ /api/v1/* → backend:3000(容器内网)
        └─ /api/*(非 v1)→ 腾讯行情(带 Referer: https://gu.qq.com/,去 /api 前缀)
              │
        backend 容器(Fastify + SQLite)
              └─ mp-data 卷(/app/backend-server/data/mp.db)
```

---

## 0. 前置清单

| 项 | 说明 |
| --- | --- |
| ECS | 2C4G 起步即可(单实例、SQLite、进程内限流,不支持多副本)。地域选**华东/华南等境内**,访问腾讯行情延迟正常 |
| 系统 | Ubuntu 22.04 / Debian 12 / Alibaba Cloud Linux 3 均可 |
| 数据盘 | 可选;生产建议给 Docker 数据目录(默认 `/var/lib/docker`)单独挂数据盘,便于备份扩容 |
| 域名 | 已在阿里云实名;解析 A 记录到 ECS 公网 IP(**ICP 备案通过前不能对外提供 80/443 服务**) |
| 代码 | 本仓库推送到 git 远端,服务器上 `git clone` |

> 注意:腾讯行情接口限流是 backend **进程内**的内存缓存(200ms 间隔 + 60s TTL),
> **只能单实例部署**。不要上多副本 / ACK / 负载均衡。这也是选择单机 Docker Compose 的原因。

---

## 1. ICP 备案(中国大陆地域必须,尽早开始)

1. 在阿里云控制台完成域名实名认证 + 云服务器备案(免费,1–3 周)。
2. **备案期间 80/443 会被阿里云拦截**,域名无法提供网页服务——所以流程上建议:
   先把服务器、Docker、代码全部部署好(可用 IP + Hosts 或非标准端口本地验证),
   备案通过后再解析域名、开 HTTPS。
3. 备案通过后:确认域名解析生效 → 按第 5 节启用 HTTPS 配置。

> 若用境外地域(如香港/新加坡)可免备案,但访问腾讯行情延迟高、不稳定,不推荐。

---

## 2. 安装 Docker(服务器上执行一次)

```bash
# Ubuntu / Debian 官方脚本
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker

# 验证
docker --version && docker compose version
```

---

## 3. 拉取代码并构建

```bash
cd /opt && git clone <你的仓库地址> mp && cd mp/deploy
cp .env.example .env

# 首次构建较慢(拉基础镜像 + 编译 better-sqlite3),之后走缓存
docker compose up -d --build
docker compose ps          # 两个容器都应为 Up
```

构建期间会做的事:

- `Dockerfile.web`:pnpm 安装 web 依赖 → 构建 `@mp/shared` → `vite build` → nginx 托管 `dist`;
- `Dockerfile.backend`:pnpm 安装 backend 依赖(编译 better-sqlite3)→ 构建 `@mp/shared` → `tsup` 编译 backend → `pnpm prune --prod` 去 dev 依赖 → node 运行;
- 两个 Dockerfile 内置了 **npmmirror 源**(`registry.npmmirror.com`),大陆服务器拉依赖不需要额外配置。

验证(在服务器本机):

```bash
curl -s http://127.0.0.1/api/v1/watchlist | head -c 300   # backend 反代通,返回默认三大指数
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/  # 前端页面,200
```

---

## 4. 安全组(阿里云控制台 → ECS → 安全组 → 配置规则)

| 方向 | 端口 | 协议 | 授权对象 | 用途 |
| --- | --- | --- | --- | --- |
| 入方向 | 22 | TCP | 你的 IP(建议) | SSH 管理 |
| 入方向 | 80 | TCP | 0.0.0.0/0 | HTTP(备案通过前可先不开) |
| 入方向 | 443 | TCP | 0.0.0.0/0 | HTTPS |

- backend 端口 **3000 不对公网开放**(compose 里只有 `expose`,无 `ports`),外部只能经 nginx 反代访问——同时省掉了 CORS 配置。
- 出方向默认全放行即可(需访问腾讯行情 + 拉镜像)。

---

## 5. HTTPS(备案通过后)

### 方式 A:阿里云免费 SSL 证书(推荐,一年一换)

1. 控制台 → 数字证书管理服务 → 申请免费证书(单域名),验证域名后签发;
2. 下载 **nginx 版**证书,上传到服务器 `mp/deploy/certs/` 并改名:

   ```bash
   mkdir -p deploy/certs
   # 域名.pem → fullchain.pem;域名.key → privkey.pem
   mv 你的域名.pem deploy/certs/fullchain.pem
   mv 你的域名.key deploy/certs/privkey.pem
   ```

3. 启用 HTTPS 配置:用 `deploy/nginx.ssl.conf` 的内容替换 `deploy/nginx.conf`(或改 compose 挂载),重启:

   ```bash
   docker compose up -d --build web   # 或:docker compose restart web
   ```

   确认 80 → 443 跳转生效:`curl -I https://你的域名`。

### 方式 B:Let's Encrypt(certbot,自动续期,需 80 端口可访问)

```bash
sudo apt install -y certbot
# 先保证 nginx.conf(HTTP 版)在跑
sudo certbot certonly --nginx -d 你的域名 --register-unsafely-without-email
# 之后按方式 A 步骤 3 启用 SSL 配置,并配置 certbot renew 定时续期 + 重载 nginx
```

---

## 6. 数据备份(SQLite)

用户数据全部在 `mp-data` 卷的 `mp.db`(自选/浏览记录/公式/画线)。备份方案:

```bash
# 方案一:直接备份卷文件(容器运行中请用 sqlite 在线备份或先停 backend)
docker compose stop backend
docker run --rm -v mp_mp-data:/data -v /opt/backup:/backup alpine \
  cp /data/mp.db /backup/mp-$(date +%F).db
docker compose start backend

# 方案二(推荐):每日 cron + 上传 OSS
# 1) 服务器安装 ossutil(阿里云官方工具)
# 2) crontab -e 添加:
# 30 2 * * * docker compose -f /opt/mp/deploy/docker-compose.yml stop backend \
#   && docker run --rm -v mp_mp-data:/data -v /opt/backup:/backup alpine cp /data/mp.db /backup/mp.db \
#   && docker compose -f /opt/mp/deploy/docker-compose.yml start backend \
#   && ossutil cp /opt/backup/mp.db oss://你的bucket/mp-backup/mp-$(date +%F).db
```

首次启动会自动建库并种子三大指数(上证指数/科创综指/创业板指)。

---

## 7. 日常更新

```bash
cd /opt/mp
git pull
cd deploy
docker compose up -d --build    # 变更的镜像自动重建,数据卷不动
docker compose ps
```

---

## 8. 运维速查

```bash
docker compose logs -f backend   # 后端日志
docker compose logs -f web       # nginx 日志
docker compose ps                # 容器状态(restart: unless-stopped 自动拉起)

# 备份恢复(用第 6 节备份的 mp.db 覆盖卷内文件后重启 backend)
# docker compose stop backend
# docker run --rm -v mp_mp-data:/data -v /opt/backup:/backup alpine \
#   cp /backup/mp.db /data/mp.db
# docker compose start backend
```

常见问题:

- **页面能开但行情空白**:检查 nginx 腾讯反代是否生效——浏览器 F12 看 `/api/appstock/...` 请求:
  404/5xx 多为反代配置问题(Referer 头、rewrite);NetworkError 说明走了直连(部署后应全部同源 `/api`)。
- **K 线加载慢/失败**:腾讯接口偶发限流,backend 有 60s TTL 缓存;检查服务器到 `web.ifzq.gtimg.cn` 连通性。
- **better-sqlite3 构建失败**:重试 `docker compose build backend`;确认服务器能访问 registry(已内置 npmmirror)。

---

## 9. 与仓库现状的对应关系(部署范围说明)

- 本轮部署**不改业务代码**:web 仍走「nginx → 腾讯」的行情直连(复刻 Vite 代理规则),
  用户数据(自选/画线/公式/设置)仍存浏览器 localStorage;
- backend 的 REST(`/api/v1/*`)目前主要服务 mcp-server(本地 AI 助手接入时 `MCP_BACKEND_URL` 指向本机 nginx 即可,如 `http://你的域名/api/v1`);
- 按 `api/README.md` 实施分期,后续若把 web 切到消费 REST(自选/画线等落库),反代无需改动,
  前端请求仍走同源 `/api/v1/*`,自动到达 backend。
- mcp-server 是 stdio 进程,**不需要**部署到服务器;在本地开发机运行并指向线上 backend 即可。
