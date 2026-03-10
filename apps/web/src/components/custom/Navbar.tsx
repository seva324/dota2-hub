import { useState, useEffect } from 'react';
import { Menu, X, Trophy, Newspaper, Users, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { label: '赛事战报', href: '#tournaments', icon: Trophy },
  { label: '赛事预告', href: '#upcoming', icon: Flame },
  { label: '转会新闻', href: '#news', icon: Newspaper },
  { label: '社区热点', href: '#community', icon: Users },
];

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-slate-950/95 backdrop-blur-md shadow-lg border-b border-slate-800'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
              <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base sm:text-xl font-bold text-white">DOTA2 Pro Hub</h1>
              <p className="text-[10px] sm:text-xs text-slate-400 hidden xs:block">专业战报</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                className="text-slate-300 hover:text-white hover:bg-slate-800/50"
                onClick={() => scrollToSection(item.href)}
              >
                <item.icon className="w-4 h-4 mr-2" />
                {item.label}
              </Button>
            ))}
          </div>

          {/* Update Time */}
          <div className="hidden lg:block text-right">
            <p className="text-xs text-slate-500">每日更新</p>
            <p className="text-sm text-slate-300">08:00 AM</p>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-800">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Button
                  key={item.href}
                  variant="ghost"
                  className="justify-start text-slate-300 hover:text-white hover:bg-slate-800/50"
                  onClick={() => scrollToSection(item.href)}
                >
                  <item.icon className="w-4 h-4 mr-3" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
