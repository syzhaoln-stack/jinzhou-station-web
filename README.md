# 金州场站三维演示

以真实倾斜摄影三维模型为基础，展示场站空间、铁路来货、门机转运、人车协同、安防出入口和应急演练。建筑、门机、门禁和局部地面修复可与原貌切换对照。

- [观看约 103 秒配音成片](https://syzhaoln-stack.github.io/jinzhou-station-web/review/watch.html)：直接播放已导出的 MP4，使用章节进度条定位内容。
- [打开 9 章实时三维预览](https://syzhaoln-stack.github.io/jinzhou-station-web/review/film-review.html)：逐章查看实时渲染画面与配音。
- [进入三维交互系统](https://syzhaoln-stack.github.io/jinzhou-station-web/review/operations.html)：旋转缩放、铁路来货与转运、人车协同、门杆抬落、建筑开门疏散、反恐预警及侵线预警演练。

首次全景模型约 172 MB，加载时间取决于网络与设备性能。只观看成片可先打开视频页。

路线、任务、姓名和应急过程为演示设定，不代表现场作业指令、实测疏散时长或机械施工图。

## 运行与发布

此仓库保存网页发布配置。运行模型、图片、配音、网页及用于在线播放的 MP4 成片由版本附件 `station-web.zip` 提供；Actions 校验整个 ZIP 和逐文件 SHA-256 后，将真实文件部署到 GitHub Pages。公开演示不包含 Blender 源工程或原始 OSGB 档案。

`release.json` 记录已验收发布包的 tag、字节数和 SHA-256。准备阶段的 `ready: false` 阻止工作流下载或发布旧包。更新为验收后的新包并上传同名版本附件后，手动运行 `Publish station demo` 工作流。

首次发布需先将仓库 Pages 的构建来源设为 GitHub Actions。静态网站提供交互、配音章节、现有成片播放和画面下载；生成新的 MP4 仍需要本地制作环境。

Third-party library notices are included in the published bundle at `review/vendor/LICENSE`.
