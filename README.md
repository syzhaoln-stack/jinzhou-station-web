# 金州场站三维演示

以真实倾斜摄影三维模型为基础，展示场站空间、铁路来货、门机转运、人车协同、安防出入口和应急演练。建筑、门机、门禁和局部地面修复可与原貌切换对照。

- [观看约 103 秒配音成片](https://syzhaoln-stack.github.io/jinzhou-station-web/review/watch.html)：直接播放已导出的 MP4，使用章节进度条定位内容。
- [打开 9 章实时三维预览](https://syzhaoln-stack.github.io/jinzhou-station-web/review/film-review.html)：逐章查看实时渲染画面与配音。
- [进入三维交互系统](https://syzhaoln-stack.github.io/jinzhou-station-web/review/operations.html)：旋转缩放、铁路来货与转运、人车协同、门杆抬落、建筑开门疏散、反恐预警及侵线预警演练。

在三维交互系统中选择「业务与物联」，可查看关联三维对象的作业台账、前置确认和资源占用，逐步演示正常接卸、停用区侵入、门机异常和仓库消防等场景。候选传感器点位与信号面板展示原始报文、解码值、信号质量、规则条件及处置记录；异常处置包含确认、派单、证据、独立复核和单独解封。

网页可导出带当前三维视角的 HTML 报告、CSV 作业台账和 JSON 快照，也可从报告页打印或保存 PDF。原生 DOCX 报告和模拟报文 HTTP 接口仅在本地服务环境提供，GitHub Pages 运行浏览器独立仿真。接入方式见[说明](https://syzhaoln-stack.github.io/jinzhou-station-web/review/business-integration-guide.md)与 [OpenAPI 契约](https://syzhaoln-stack.github.io/jinzhou-station-web/review/business-api.openapi.json)。

首次全景模型约 172 MB，加载时间取决于网络与设备性能。只观看成片可先打开视频页。

路线、任务、姓名和应急过程为演示设定，不代表现场作业指令、实测疏散时长或机械施工图。

业务台账、设备报文、岗位姓名和规则阈值均为虚构样本；传感器位置为待踏勘候选点位。尚未连接 95306、真实摄像头、消防主机或 PLC，不提供设备联锁控制或 24 小时后台监测。公开依据用于解释业务模式和协议结构，不代表金州场站的真实台账或已取得接口授权。

## 运行与发布

此仓库保存网页发布配置。运行模型、图片、配音、网页及用于在线播放的 MP4 成片由版本附件 `station-web.zip` 提供；Actions 校验整个 ZIP 和逐文件 SHA-256 后，将真实文件部署到 GitHub Pages。公开演示不包含 Blender 源工程或原始 OSGB 档案。

`release.json` 记录已验收发布包的 tag、字节数和 SHA-256。准备阶段的 `ready: false` 阻止工作流下载或发布旧包。更新为验收后的新包并上传同名版本附件后，手动运行 `Publish station demo` 工作流。

首次发布需先将仓库 Pages 的构建来源设为 GitHub Actions。静态网站提供交互、配音章节、现有成片播放和画面下载；生成新的 MP4 仍需要本地制作环境。

Third-party library notices are included in the published bundle at `review/vendor/LICENSE`.
