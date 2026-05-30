# embedded — 嵌入式开发专项

启用后，下次 `duoshe rescan` 会：

- 识别 **PlatformIO / ESP-IDF / Zephyr / Arduino / 裸 CMake** 等 C 固件技术栈
- 识别 **Vivado / Quartus / 通用 VHDL/Verilog/SystemVerilog** FPGA 项目
- 识别 **TwinCAT / Codesys / IEC 61131-3** PLC 项目
- 为 `BSP/` `HAL/` `drivers/` `rtl/` `tb/` `pou/` `gvl/` 等目录显示中文标签

## 适合什么场景

- STM32 / ESP32 / 树莓派裸机 / 任意 MCU 固件
- FPGA 开发（Xilinx Vivado、Intel Quartus、Lattice）
- 工业 PLC 项目（伺服 / 变频 / 运动控制）

## 不适合什么场景

- 纯 Linux 应用层 C/C++（核心检测就够了）
- Arduino 简单小玩具（kid profile 更合适）

## 不用了怎么办

`duoshe skill disable embedded`，记忆库里已写入的内容不会动。
