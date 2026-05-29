# 发布指南

nano-duoshe 通过 npm 分发，GitHub Release 留作存档。整个发布流程是「打 tag → CI 自动发」。

## 一次性准备

发第一个版本之前要把这些配好（只做一次）：

### 1. npm 账号 + 自动化 token

1. 在 https://www.npmjs.com 注册账号（如果还没有）
2. 登录后 → Access Tokens → Generate New Token → 选 **Automation**
3. 复制 token（只显示一次）
4. 在 GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret
   - Name: `NPM_TOKEN`
   - Value: 粘贴刚才的 token

### 2. （可选）npm 双因素 + provenance

发布 workflow 已经开启 `--provenance`，这要求：
- 仓库是 public ✅（你已经是）
- npm 包名可用 ✅（`nano-duoshe` 尚未被占用 — 第一次发布时锁定）

如果第一次 `npm publish` 报 403，多半是包名被占了或 token 权限不够，去 npm 网页确认下。

## 日常发布流程

### 选 bump 类型

| 改了什么 | 用哪个 |
|---|---|
| 修 bug，行为兼容 | `patch` → 0.1.0 → 0.1.1 |
| 加功能，向后兼容 | `minor` → 0.1.0 → 0.2.0 |
| 破坏性改动 | `major` → 0.1.0 → 1.0.0 |
| 想先发个测试版 | `prerelease` → 0.1.0 → 0.1.1-0（发到 `next` tag） |
| 指定具体版本号 | `0.2.0-beta.1` 之类 |

### 一条命令搞定

```powershell
scripts\release.ps1 patch
```

这个脚本会：
1. 检查你在 `main` 分支、工作区干净、和远端同步
2. 跑 lint / typecheck / test（除非加 `-SkipChecks`）
3. `npm version` 改 package.json
4. 提交、打 tag（`v0.1.1`）、推送
5. GitHub Actions 接手：再跑一遍测试 + build + 发到 npm + 建 GitHub Release

干跑看看会发生什么：

```powershell
scripts\release.ps1 patch -DryRun
```

### 观察发布过程

- Actions: https://github.com/guangdino/nano-duoshe/actions
- npm:     https://www.npmjs.com/package/nano-duoshe
- Release: https://github.com/guangdino/nano-duoshe/releases

正常情况下推 tag 后 3-5 分钟包就上 npm 了。

## 用户怎么装、怎么升

### 装

```bash
# 全局装一份，到处都能用 duoshe
npm install -g nano-duoshe

# 或者不装，直接跑（推荐给只想试一下的人）
npx nano-duoshe init
```

### 升

duoshe 启动时会异步查 npm registry，发现新版本会显示一行温和提示（不打断流程）。
用户主动查的话：

```bash
duoshe upgrade
```

会打印当前版本、最新版本、对应安装方式的升级命令。

### 关掉自动检查

如果用户不想被打扰：

```bash
export DUOSHE_NO_UPDATE_CHECK=1
```

CI 环境（`CI=1`）下也会自动跳过。

## 紧急情况

### 发错了想撤

npm 24 小时内可以 unpublish：

```bash
npm unpublish nano-duoshe@<version>
```

超过 24 小时只能 deprecate（包还在，但安装时会警告）：

```bash
npm deprecate nano-duoshe@<version> "请用更新的版本，这个有问题"
```

### tag 推出去了但发布失败

```bash
# 删本地 tag
git tag -d v0.1.1
# 删远端 tag
git push origin :refs/tags/v0.1.1
# 修问题，重新跑 release.ps1
```

### CI 没跑起来

检查：
- tag 名字必须是 `v` 开头（`v0.1.1` ✅，`0.1.1` ❌）
- `NPM_TOKEN` 这个 secret 存在且没过期
- package.json 的 `version` 和 tag 名字对得上（脚本会自动保持一致）

## 版本号约定

遵循 [semver](https://semver.org)：

- `0.x.y` 阶段：minor 可以包含破坏性改动（用户应该有心理准备）
- `1.0.0` 之后：major 才允许破坏性改动
- 预发布版本（`-alpha.0`、`-beta.1`、`-rc.0`）会发到 npm 的 `next` dist-tag，不会推给普通用户

要装预发布版本：

```bash
npm install -g nano-duoshe@next
```
