// 导入 fs-extra 模块，提供增强的文件系统操作方法
import * as fs from 'fs-extra'
// 导入 path 模块，用于处理和转换文件路径
import * as path from 'path'
// 从常量配置文件导入各种目录和文件路径常量
import { USER_DIR, USER_PLUGIN_DIR, USER_THEME_DIR, RESOURCES_DIR, BUILD_IN_STYLES, PANDOC_REFERENCE_FILE, HISTORY_DIR, USER_EXTENSION_DIR } from './constant'
// 导入更新器模块，执行应用更新相关逻辑
import './updater'

// 导出默认函数，作为应用启动时的初始化入口
export default function () {
  // 确保用户数据目录存在，如果不存在则创建
  fs.ensureDirSync(USER_DIR)
  
  // 检查插件目录是否存在
  if (!fs.existsSync(USER_PLUGIN_DIR)) {
    // 创建插件目录
    fs.mkdirSync(USER_PLUGIN_DIR)
    // 在插件目录中创建一个示例插件文件，用于指导开发者如何编写插件
    fs.writeFileSync(path.join(USER_PLUGIN_DIR, 'plugin-example.js'), `
window.registerPlugin({
  name: 'example-plugin',
  register: ctx => {
    console.log('example-plugin', 'register', ctx);

    // setTimeout(() => {
    //   ctx.ui.useToast().show('info', 'HELLO WORLD!');
    // }, 2000);
  }
});
    `.trim())
  }

  // 确保用户主题目录存在
  fs.ensureDirSync(USER_THEME_DIR)
  // 确保历史记录目录存在
  fs.ensureDirSync(HISTORY_DIR)
  // 确保用户扩展目录存在
  fs.ensureDirSync(USER_EXTENSION_DIR)

  // 遍历所有内置样式文件
  BUILD_IN_STYLES.forEach(style => {
    // 将每个内置样式文件从资源目录复制到用户主题目录
    fs.writeFileSync(
      path.join(USER_THEME_DIR, style),
      fs.readFileSync(path.join(RESOURCES_DIR, style))
    )
  })

  // 构建 Pandoc 文档模板文件的完整路径
  const docxTplPath = path.join(USER_DIR, PANDOC_REFERENCE_FILE)
  // 如果模板文件不存在，则从资源目录复制
  if (!fs.existsSync(docxTplPath)) {
    // 使用流式复制，适合大文件传输
    fs.createReadStream(path.join(RESOURCES_DIR, PANDOC_REFERENCE_FILE))
      .pipe(fs.createWriteStream(docxTplPath))
  }
}
