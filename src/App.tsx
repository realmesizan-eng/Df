import { useState } from 'react';
import {
  Code2,
  Menu,
  MessageCircle,
  Shield,
  Smartphone,
  X,
} from 'lucide-react';
import { AdminConsole } from './components/AdminConsole';
import { AndroidClientWorkspace } from './components/AndroidClientWorkspace';
import { SourceExplorer } from './components/SourceExplorer';
import { ZentrixEmblem } from './components/ZentrixEmblem';
import { UI_TEXT } from './i18n';
import type { AppLang } from './i18n';

type WorkspaceSection = 'android-client' | 'owner-admin' | 'source-explorer';

export default function App() {
  const [section, setSection] = useState<WorkspaceSection>('android-client');
  const [lang, setLang] = useState<AppLang>('bn');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Admin session held strictly in React state memory (never localStorage)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  // Seamless handoff of a newly approved license key from Admin Console -> Android Client
  const [handedOffKey, setHandedOffKey] = useState<string | null>(null);

  const t = UI_TEXT[lang];

  const navItems: Array<{
    id: WorkspaceSection;
    label: string;
    detail: string;
    icon: typeof Smartphone;
  }> = [
    {
      id: 'android-client',
      label: t.navAndroid,
      detail: t.navAndroidDetail,
      icon: Smartphone,
    },
    {
      id: 'owner-admin',
      label: t.navAdmin,
      detail: t.navAdminDetail,
      icon: Shield,
    },
    {
      id: 'source-explorer',
      label: t.navSource,
      detail: t.navSourceDetail,
      icon: Code2,
    },
  ];

  const currentBreadcrumb =
    section === 'android-client'
      ? t.navAndroid
      : section === 'owner-admin'
        ? t.navAdmin
        : t.navSource;

  const handleSelectSection = (target: WorkspaceSection) => {
    setSection(target);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#080A0C] text-[#E6ECF2] flex">
      {/* Persistent Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-[#1A2029] bg-[#0B0E12]">
        <div className="px-5 py-5 border-b border-[#1A2029] flex items-center gap-3">
          <ZentrixEmblem size={38} />
          <div className="min-w-0">
            <div className="font-display text-lg font-bold tracking-wider text-[#E6ECF2] leading-tight">
              ZENTRIX
            </div>
            <div className="text-[11px] text-[#39FF14] truncate">{t.tagline}</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSection(item.id)}
                className={`w-full text-left px-3.5 py-3 rounded-lg transition-colors flex items-start gap-3 cursor-pointer ${
                  active
                    ? 'bg-[#141A22] text-[#E6ECF2] border border-[#242E3B]'
                    : 'text-[#8B97A5] hover:bg-[#10141A] hover:text-[#E6ECF2] border border-transparent'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    active ? 'text-[#39FF14]' : 'text-[#6B7785]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{item.label}</div>
                  <div className="text-xs text-[#6B7785] mt-0.5">{item.detail}</div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-[#1A2029] space-y-2">
          <div className="text-[11px] text-[#7E8B99]">{t.languageLabel}</div>
          <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg">
            <button
              type="button"
              onClick={() => setLang('bn')}
              className={`flex-1 py-1 text-xs font-medium rounded-md cursor-pointer ${
                lang === 'bn' ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5] hover:text-[#E6ECF2]'
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`flex-1 py-1 text-xs font-medium rounded-md cursor-pointer ${
                lang === 'en' ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5] hover:text-[#E6ECF2]'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-[#1A2029] space-y-2 text-xs text-[#7E8B99]">
          <div className="font-medium text-[#C8D0D8]">{t.officialSupportHeader}</div>
          <div className="font-mono text-[#39FF14]">01747570144</div>
          <div>{t.lifetimeSummary}</div>
          <div className="pt-1 text-[11px] text-[#5F6C7B]">{t.independentNotice}</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[85vw] bg-[#0B0E12] border-r border-[#1A2029] flex flex-col">
            <div className="px-5 py-4 border-b border-[#1A2029] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ZentrixEmblem size={32} />
                <span className="font-display font-bold tracking-wider text-[#E6ECF2]">ZENTRIX</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-[#8B97A5] hover:text-[#E6ECF2] cursor-pointer"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="p-3 space-y-1 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSection(item.id)}
                    className={`w-full text-left px-3.5 py-3 rounded-lg flex items-center gap-3 cursor-pointer ${
                      active ? 'bg-[#141A22] text-[#39FF14]' : 'text-[#9BA6B4]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#1A2029]">
              <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg">
                <button
                  type="button"
                  onClick={() => setLang('bn')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    lang === 'bn' ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5]'
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    lang === 'en' ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5]'
                  }`}
                >
                  English
                </button>
              </div>
            </div>
          </div>
          <div
            className="flex-1 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean SaaS Top Bar: Breadcrumb left + single primary action right */}
        <header className="h-14 px-5 lg:px-8 border-b border-[#1A2029] bg-[#0B0E12] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-[#9BA6B4] hover:text-[#E6ECF2] cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="font-display font-semibold text-[#E6ECF2] whitespace-nowrap">ZENTRIX</span>
              <span className="text-[#4B5664]" aria-hidden="true">/</span>
              <span className="text-[#9BA6B4] truncate">{currentBreadcrumb}</span>
            </div>
          </div>

          <a
            href="https://wa.me/8801747570144"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {t.whatsappSupport}
          </a>
        </header>

        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {section === 'android-client' && (
            <AndroidClientWorkspace
              lang={lang}
              handedOffKey={handedOffKey}
              onClearHandedOffKey={() => setHandedOffKey(null)}
              onJumpToAdmin={() => setSection('owner-admin')}
            />
          )}

          {section === 'owner-admin' && (
            <AdminConsole
              lang={lang}
              adminToken={adminToken}
              adminEmail={adminEmail}
              onAdminAuthenticated={(tok, mail) => {
                setAdminToken(tok);
                setAdminEmail(mail);
              }}
              onAdminLogout={() => {
                setAdminToken(null);
                setAdminEmail(null);
              }}
              onHandoffLicenseKey={(key) => {
                setHandedOffKey(key);
                setSection('android-client');
              }}
            />
          )}

          {section === 'source-explorer' && <SourceExplorer />}
        </main>
      </div>
    </div>
  );
}
