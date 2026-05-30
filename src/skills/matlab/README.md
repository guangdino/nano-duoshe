# matlab — MATLAB / 算法 / 控制工程专项

启用后，下次 `duoshe rescan` 会：

- 识别 **MATLAB / Simulink** 技术栈（.slx / .mlx / .mdl / .m）
- 为 `matlab/` `simulink/` `algorithms/` `derivations/` `golden/` `captures/` 等目录显示中文标签

## 适合什么场景

- 控制算法开发（电机控制、PID 调参、状态空间模型）
- 信号处理 / 数据分析（傅立叶、滤波器、谱分析）
- Simulink 仿真 + 自动生成 C 代码的工作流
- 数学推导密集的研究项目

## 配合 remember 怎么用

记下实验基准、参数对照、模型版本，对控制类项目特别重要：

```
duoshe remember "v1 基线 settling time 35ms @ 1Nm step"
duoshe remember "Kp=2.4, Ki=0.18 是当前 sweet spot，Ki>0.2 会震荡"
```

## 不用了怎么办

`duoshe skill disable matlab`，记忆库里已写入的内容不会动。
