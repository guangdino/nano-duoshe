# devops — 基础设施 / IaC 专项

启用后，下次 `duoshe rescan` 会：

- 识别 **Terraform**（.tf 文件 / `terraform/` / `infra/` / `tf/` 子目录）
- 识别 **Ansible**（playbook.yml / site.yml / ansible.cfg）
- 为 `terraform/` `ansible/` `playbooks/` `roles/` `k8s/` `helm/` 等目录显示中文标签

## 适合什么场景

- 用 Terraform 管云资源（AWS / GCP / Azure / 阿里云）
- 用 Ansible 做配置管理 / 批量部署
- Kubernetes / Helm chart 维护
- IaC 仓库（独立的或大项目里的 `infra/` 子目录）

## 配合 remember 怎么用

基础设施变更的"为什么"比"做了什么"更重要，记下来：

```
duoshe remember "RDS 实例升 r6g.xlarge 是因为 p99 写延迟超过 200ms"
duoshe remember "VPC peering 改成 transit gateway 是 2026 Q1 的合规要求"
```

## 不用了怎么办

`duoshe skill disable devops`，记忆库里已写入的内容不会动。
