import { registerAction } from './action'
import config from './config'
import yaml from 'yaml'
import os from 'os'

// 环境变量配置的键名常量
const keyEnvs = 'envs'
// 判断当前操作系统是否为 Windows
const isWin = os.platform() === 'win32'
// 保存应用启动时的原始环境变量副本，用于重置
const OLD_ENVS = { ...process.env }

/**
 * 初始化环境变量
 * 从配置中读取环境变量设置并应用到当前进程
 * 支持 YAML 格式配置，特别处理 PATH 变量的合并
 * 注意：Windows 平台禁用此功能
 */
export function initEnvs () {
  // Windows 平台不支持此功能，直接返回
  if (isWin) {
    console.log('envs: disable on windows')
    return
  }

  // 重置环境变量为应用启动时的原始状态
  // 这样可以确保每次重新加载时不会累积重复的值
  process.env = OLD_ENVS

  // 从配置中读取环境变量 YAML 字符串
  const envsStr = config.get(keyEnvs, '')
  console.log('envs:', envsStr)

  let envs: Record<string, any>
  try {
    // 解析 YAML 格式的环境变量配置
    envs = yaml.parse(envsStr)
    // 如果解析结果为空或不是对象类型，则直接返回
    if (!envs || typeof envs !== 'object') {
      return
    }
  } catch (error) {
    // YAML 解析失败时输出错误信息
    console.error('parse envs error:', error)
    return
  }

  // 根据操作系统确定路径分隔符：Windows 使用 ';'，其他使用 ':'
  const sep = isWin ? ';' : ':'

  // 遍历所有环境变量配置
  Object.keys(envs).forEach(key => {
    // 对 PATH 变量进行特殊处理：合并路径而不是直接覆盖
    if (key.toUpperCase() === 'PATH') {
      // 将 PATH 值统一转换为数组格式
      // 支持数组类型或字符串类型（按分隔符分割）
      const path = Array.isArray(envs[key])
        ? envs[key]
        : (typeof envs[key] === 'string' ? envs[key].split(sep) : [])

      // 合并多个来源的路径：
      // 1. 配置中定义的路径
      // 2. 当前进程已有的 PATH 值
      // 3. 非 Windows 系统额外添加 /usr/local/bin
      const paths = Array.from(new Set([
        ...path,
        ...((process.env[key] || '').split(sep)),
        ...(isWin ? [] : ['/usr/local/bin']),
      ]))

      // 将路径数组用分隔符连接成字符串并设置到环境变量
      process.env.PATH = paths.join(sep)
    } else {
      // 非 PATH 变量直接设置值
      process.env[key] = envs[key]
    }
  })
}

// 注册 'envs.reload' 动作，允许其他模块调用以重新加载环境变量配置
registerAction('envs.reload', initEnvs)
