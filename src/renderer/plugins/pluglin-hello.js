// 注册一个插件
window.registerPlugin({
    name: 'plugin-hello',
    register: ctx => {
        // 添加状态栏菜单
        ctx.statusBar.tapMenus(menus => {
            menus['plugin-hello'] = {
                id: 'plugin-hello',
                position: 'left',
                title: 'HELLO',
                onClick: () => {
                    ctx.ui.useToast().show('info', 'HELLO WORLD!');
                }
            }
        })
    }
});