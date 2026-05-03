function DotaHubMark() {
  return (
    <div className="relative size-8 shrink-0 rounded-xl bg-gradient-to-br from-red-500 to-red-700">
      <div className="absolute inset-1.5 rounded-md border-4 border-slate-950/80" />
      <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950" />
    </div>
  );
}

export function Footer({ lastUpdated }: { lastUpdated?: string }) {
  const updatedDate = lastUpdated ? new Date(lastUpdated).toLocaleDateString('zh-CN') : null;

  return (
    <footer className="hidden border-t border-white/8 bg-[#030508] lg:block">
      <div className="mx-auto max-w-[1480px] px-6 py-12">
        <div className="grid grid-cols-[220px_1fr_1fr_1fr_200px] gap-10">
          {/* Brand */}
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <DotaHubMark />
              <span className="text-lg font-black tracking-tight text-white">DotaHub</span>
            </div>
            <p className="mb-1 text-sm font-medium text-slate-300">专业的 Dota 2 赛事数据平台</p>
            <p className="text-xs leading-5 text-slate-500">覆盖全球赛事、战队、选手与深度数据分析</p>
          </div>

          {/* 产品 */}
          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">产品</h4>
            <ul className="space-y-2.5">
              {['比赛数据', '战队排行', '选手排行', '数据统计'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{item}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* 关于我们 */}
          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">关于我们</h4>
            <ul className="space-y-2.5">
              {['关于 DotaHub', '加入我们', '联系我们', '免责声明'].map((item) => (
                <li key={item}>
                  <a href="#" className="text-sm text-slate-400 hover:text-white transition-colors">{item}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* 关注我们 */}
          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">关注我们</h4>
            <div className="flex gap-2">
              {[
                { label: '微博', color: 'bg-red-600', text: 'W' },
                { label: 'bilibili', color: 'bg-sky-500', text: 'B' },
                { label: 'Discord', color: 'bg-indigo-600', text: 'D' },
                { label: 'Twitter', color: 'bg-slate-700', text: 'X' },
              ].map((social) => (
                <a
                  key={social.label}
                  href="#"
                  title={social.label}
                  className={`size-9 ${social.color} rounded-xl flex items-center justify-center text-[11px] font-bold text-white hover:opacity-80 transition-opacity`}
                >
                  {social.text}
                </a>
              ))}
            </div>
          </div>

          {/* 下载 App */}
          <div>
            <h4 className="mb-4 text-sm font-semibold text-white">下载 App</h4>
            <div className="space-y-2">
              <a href="#" className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors">
                <span className="text-base">🍎</span>
                <span className="text-sm font-medium">App Store</span>
              </a>
              <a href="#" className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors">
                <span className="text-base">🤖</span>
                <span className="text-sm font-medium">Android</span>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex items-center justify-between border-t border-white/8 pt-6 text-xs text-slate-500">
          <span>
            © 2024 DotaHub.cn · 闽ICP备2022031312号-1
            {updatedDate ? ` · 更新 ${updatedDate}` : ''}
          </span>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-white transition-colors">隐私政策</a>
            <a href="#" className="hover:text-white transition-colors">用户协议</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
