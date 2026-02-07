import { Trophy, Github, Twitter, MessageCircle, ExternalLink } from 'lucide-react';

const footerLinks = {
  tournaments: [
    { label: 'BLAST Slam', href: '#' },
    { label: 'DreamLeague', href: '#' },
    { label: 'PGL Wallachia', href: '#' },
    { label: 'The International', href: '#' },
  ],
  resources: [
    { label: 'Liquidpedia', href: 'https://liquipedia.net/dota2' },
    { label: 'Dotabuff', href: 'https://www.dotabuff.com' },
    { label: 'OpenDota', href: 'https://www.opendota.com' },
    { label: 'GosuGamers', href: 'https://www.gosugamers.net/dota2' },
  ],
  community: [
    { label: 'Reddit r/DotA2', href: 'https://reddit.com/r/DotA2' },
    { label: 'NGA论坛', href: 'https://nga.cn' },
    { label: 'Twitter/X', href: '#' },
  ],
};

export function Footer({ lastUpdated }: { lastUpdated?: string }) {
  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">DOTA2 Pro Hub</h3>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              专业的DOTA2战报与赛事预测平台，为每一位刀友提供最新最全的电竞资讯。
            </p>
            <div className="flex items-center gap-3">
              <a
                href="#"
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Tournaments */}
          <div>
            <h4 className="text-white font-semibold mb-4">T1赛事</h4>
            <ul className="space-y-2">
              {footerLinks.tournaments.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-white font-semibold mb-4">数据来源</h4>
            <ul className="space-y-2">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-white font-semibold mb-4">社区</h4>
            <ul className="space-y-2">
              {footerLinks.community.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            © 2026 DOTA2 Pro Hub. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            {lastUpdated && <span>最后更新: {lastUpdated}</span>}
            <span>|</span>
            <span>数据来源：OpenDota API, Liquidpedia</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
