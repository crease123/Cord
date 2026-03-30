/**
 * @file IOC 容器测试文件
 * @description 测试依赖注入容器 (Inversion of Control Container) 的核心功能
 * 
 * IOC 容器主要功能:
 * 1. register - 注册服务/依赖
 * 2. get - 获取服务列表 (返回副本)
 * 3. getRaw - 获取原始服务引用 (返回内部数组引用)
 * 4. remove - 移除单个服务
 * 5. removeWhen - 根据条件移除服务
 * 6. removeAll - 移除所有服务
 * 7. 版本控制 - 每次修改都会增加版本号
 */

import * as ioc from '@fe/core/ioc'

test('ioc usage', () => {
  // ============================================
  // 第一部分：基础注册和获取功能测试
  // ============================================
  
  // 测试 1: 获取未注册的键，应返回空数组
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual([])
  
  // 测试 2: 移除不存在的键 (null 值)，不应报错
  ioc.remove('ACTION_AFTER_RUN', null)
  
  // 测试 3: 注册两个服务
  ioc.register('ACTION_AFTER_RUN', 'test')
  ioc.register('ACTION_AFTER_RUN', 'test1')
  // 验证服务已按注册顺序存储
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual(['test', 'test1'])
  
  // 测试 4: 尝试移除不存在的服务 ('test2' 未注册)，应无变化
  ioc.remove('ACTION_AFTER_RUN', 'test2')
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual(['test', 'test1'])
  
  // 测试 5: 移除存在的服务 ('test'), 应只保留 'test1'
  ioc.remove('ACTION_AFTER_RUN', 'test')
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual(['test1'])
  
  // 测试 6: 移除所有服务
  ioc.removeAll('ACTION_AFTER_RUN')

  // ============================================
  // 第二部分：条件移除功能测试 (removeWhen)
  // ============================================
  
  // 注册 5 个服务
  ioc.register('ACTION_AFTER_RUN', 'test')
  ioc.register('ACTION_AFTER_RUN', 'test1')
  ioc.register('ACTION_AFTER_RUN', 'test2')
  ioc.register('ACTION_AFTER_RUN', 'test3')
  ioc.register('ACTION_AFTER_RUN', 'test4')

  // 使用回调函数条件移除：移除值为 'test' 或 'test3' 的服务
  ioc.removeWhen('ACTION_AFTER_RUN', item => item === 'test' || item === 'test3')
  // 验证只剩下 'test1', 'test2', 'test4'
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual(['test1', 'test2', 'test4'])

  // ============================================
  // 第三部分：遍历移除测试
  // ============================================
  
  // 清空后重新注册 5 个服务
  ioc.removeAll('ACTION_AFTER_RUN')
  ioc.register('ACTION_AFTER_RUN', 'test')
  ioc.register('ACTION_AFTER_RUN', 'test1')
  ioc.register('ACTION_AFTER_RUN', 'test2')
  ioc.register('ACTION_AFTER_RUN', 'test3')
  ioc.register('ACTION_AFTER_RUN', 'test4')

  // 遍历所有服务并逐个移除
  // 注意：get() 返回的是副本，所以遍历不会影响内部数组
  for (const item of ioc.get('ACTION_AFTER_RUN')) {
    ioc.remove('ACTION_AFTER_RUN', item)
  }

  // 验证所有服务已被移除
  expect(ioc.get('ACTION_AFTER_RUN')).toEqual([])

  // ============================================
  // 第四部分：get vs getRaw 的区别测试
  // ============================================
  // 核心区别:
  // - get(): 返回数组副本，每次调用都创建新数组
  // - getRaw(): 返回内部数组引用，多次调用返回同一引用
  
  // 测试 1: 获取不存在的键，应返回 undefined
  expect(ioc.getRaw('ACTION_AFTER_RUN_XXX' as any) === undefined)
  
  // 注册第一个服务
  ioc.register('ACTION_AFTER_RUN', 'test1')
  const content1 = ioc.get('ACTION_AFTER_RUN')      // 获取副本
  const raw1 = ioc.getRaw('ACTION_AFTER_RUN')       // 获取原始引用
  
  // 注册第二个服务
  ioc.register('ACTION_AFTER_RUN', 'test2')
  const content2 = ioc.get('ACTION_AFTER_RUN')      // 获取新副本
  const raw2 = ioc.getRaw('ACTION_AFTER_RUN')       // 获取同一原始引用
  
  // 验证 get() 返回不同的副本对象
  expect(content1 === content2).toBe(false)
  // 验证 getRaw() 返回相同的引用
  expect(raw1 === raw2).toBe(true)
  
  // 验证副本内容正确 (互不影响)
  expect(content1).toEqual(['test1'])               // 旧副本保持不变
  expect(content2).toEqual(['test1', 'test2'])      // 新副本包含最新数据
  
  // 验证原始引用可以正确展开
  expect([...raw1!]).toEqual(['test1', 'test2'])
  expect([...raw2!]).toEqual(['test1', 'test2'])
  
  // 清空所有服务
  ioc.removeAll('ACTION_AFTER_RUN')
  // 验证清空后原始引用仍然相同，但长度变为 0
  expect(raw1 === raw2).toBe(true)
  expect(raw1?.length).toEqual(0)

  // ============================================
  // 第五部分：版本号机制测试
  // ============================================
  // IOC 容器为每个键维护一个版本号 (_version)
  // 任何修改操作 (register/remove/removeWhen/removeAll) 都会使版本号 +1
  
  // 测试 1: 未注册的键版本号为 undefined
  expect(ioc.getRaw('ACTION_BEFORE_RUN') === undefined).toBe(true)
  
  // 注册第一个服务，版本号变为 1
  ioc.register('ACTION_BEFORE_RUN', 'test1')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(1)
  
  // 注册第二个服务，版本号变为 2
  ioc.register('ACTION_BEFORE_RUN', 'test2')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(2)
  
  // 注册第三个服务，版本号变为 3
  ioc.register('ACTION_BEFORE_RUN', 'test3')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(3)
  
  // 移除单个服务，版本号变为 4
  ioc.remove('ACTION_BEFORE_RUN', 'test1')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(4)
  
  // 条件移除服务，版本号变为 5
  ioc.removeWhen('ACTION_BEFORE_RUN', item => item === 'test2')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(5)
  
  // 移除所有服务，版本号变为 6
  ioc.removeAll('ACTION_BEFORE_RUN')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(6)
  
  // 重新注册服务，版本号变为 7
  ioc.register('ACTION_BEFORE_RUN', 'test1')
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version).toBe(7)
  
  // 验证版本号属性确实存在 (不是 undefined)
  expect(ioc.getRaw('ACTION_BEFORE_RUN')?._version === undefined).toBe(false)
})
