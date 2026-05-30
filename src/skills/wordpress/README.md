# wordpress — WordPress / 网站维护专项

启用后，下次 `duoshe rescan` 会：

- 为 `wp-admin/` `wp-includes/` 标注 **"千万别动"**（这是 WordPress 核心，改了会崩）
- 为 `wp-content/` `themes/` `plugins/` `uploads/` 标注作用范围
- 让 AI 清楚知道：哪些目录是你的内容，哪些是平台核心

PHP / WordPress 框架本身的识别在核心里已有，启用这个 skill 主要是把
"禁区目录"的语义喂给 AI。

## 适合什么场景

- 维护 WordPress 站点（不管会不会写代码）
- 改主题 / 装插件 / 调样式
- 让 AI 帮忙改 footer / 加新页面，但担心 AI 乱动核心目录

## 配合 remember 怎么用

非开发者维护站点最容易丢的是**运维信息**（域名、SSL、后台账号），
记下来才不会到时候找不到：

```
duoshe remember "域名 example.com 在阿里云续费，到期日 2026-08-12"
duoshe remember "wp-admin 账号是 admin，密码在 1Password vault 'sites'"
duoshe remember "SSL 是 Let's Encrypt 自动续，每 60 天 cron 跑一次"
```

## 不用了怎么办

`duoshe skill disable wordpress`，记忆库里已写入的内容不会动。
