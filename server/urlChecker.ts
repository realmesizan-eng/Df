export interface UrlAnalysisFinding {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  detail: string;
}

export interface UrlCheckResult {
  normalizedUrl: string;
  hostname: string;
  riskLevel: 'HIGH' | 'SUSPICIOUS' | 'CAUTION' | 'NO_KNOWN_RED_FLAGS';
  score: number;
  findings: UrlAnalysisFinding[];
  threatIntelSource: string;
  limitationsNotice: string;
}

const PROTECTED_BRANDS: Array<{ brand: string; officialDomains: string[]; keywords: string[] }> = [
  {
    brand: 'bKash',
    officialDomains: ['bkash.com', 'www.bkash.com', 'shop.bkash.com', 'merchant.bkash.com'],
    keywords: ['bkash', 'b-kash', 'bkas', 'bksh', 'bikash'],
  },
  {
    brand: 'Nagad',
    officialDomains: ['nagad.com.bd', 'www.nagad.com.bd', 'mynagad.com'],
    keywords: ['nagad', 'nogod', 'nagod', 'naged', 'ngad'],
  },
  {
    brand: 'Rocket / DBBL',
    officialDomains: ['dutchbanglabank.com', 'www.dutchbanglabank.com'],
    keywords: ['dbbl', 'dutchbangla', 'rocketbd'],
  },
  {
    brand: 'Google',
    officialDomains: ['google.com', 'accounts.google.com', 'play.google.com'],
    keywords: ['g00gle', 'googIe', 'google-verify'],
  },
];

const HIGH_RISK_TLDS = new Set([
  'xyz',
  'top',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'click',
  'zip',
  'mov',
  'work',
  'icu',
  'buzz',
  'support',
]);

const SHORTENER_HOSTS = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'rb.gy',
  'is.gd',
  'cutt.ly',
  'shorturl.at',
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function isOfficialDomain(hostname: string, officialDomains: string[]): boolean {
  const lower = hostname.toLowerCase();
  return officialDomains.some((dom) => lower === dom || lower.endsWith(`.${dom}`));
}

export async function analyzeUrlSafely(rawInput: string): Promise<UrlCheckResult> {
  const trimmed = rawInput.trim();
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Invalid URL format. Provide a valid domain or http(s) web address.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs can be inspected.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const findings: UrlAnalysisFinding[] = [];
  let score = 0;

  // 1. Plaintext HTTP warning
  if (parsed.protocol === 'http:') {
    score += 20;
    findings.push({
      code: 'INSECURE_HTTP',
      severity: 'MEDIUM',
      title: 'Unencrypted HTTP connection',
      detail: 'Traffic sent over plain HTTP can be intercepted on public Wi-Fi. Never enter credentials on HTTP pages.',
    });
  }

  // 2. Embedded userinfo credentials (https://bkash.com@evil.xyz)
  if (parsed.username || parsed.password) {
    score += 45;
    findings.push({
      code: 'EMBEDDED_CREDENTIALS',
      severity: 'HIGH',
      title: 'Deceptive @-symbol credential trick detected',
      detail: 'Attackers place a trusted brand before "@" to disguise the real destination domain.',
    });
  }

  // 3. Raw IP address host
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) {
    score += 40;
    findings.push({
      code: 'RAW_IP_HOST',
      severity: 'HIGH',
      title: 'Direct IP address instead of verified domain',
      detail: 'Legitimate banking and financial portals use registered domain names, not raw IP addresses.',
    });
  }

  // 4. Punycode / IDN Homograph attack
  if (hostname.includes('xn--')) {
    score += 45;
    findings.push({
      code: 'PUNYCODE_IDN',
      severity: 'HIGH',
      title: 'Internationalized (Punycode) homograph domain',
      detail: 'This domain uses non-ASCII characters encoded as xn--, a common technique to impersonate trusted brands.',
    });
  }

  // 5. Lookalike & brand impersonation detection (bKash, Nagad, DBBL, etc.)
  const sldLabel = hostname.split('.').slice(0, -1).join('.');
  for (const brandInfo of PROTECTED_BRANDS) {
    if (isOfficialDomain(hostname, brandInfo.officialDomains)) {
      findings.push({
        code: 'OFFICIAL_DOMAIN_MATCH',
        severity: 'INFO',
        title: `Matches known official ${brandInfo.brand} domain`,
        detail: `${hostname} matches the standard official domain pattern for ${brandInfo.brand}. Still verify TLS certificate in your browser.`,
      });
      continue;
    }

    const keywordHit = brandInfo.keywords.some(
      (kw) => hostname.includes(kw) || parsed.pathname.toLowerCase().includes(kw)
    );
    const primaryOfficial = brandInfo.officialDomains[0].split('.')[0];
    const hostBase = hostname.split('.')[0];
    const dist = levenshtein(hostBase, primaryOfficial);
    const closeTypo = dist > 0 && dist <= 2 && hostBase.length >= 4;

    if (keywordHit || closeTypo) {
      score += 55;
      findings.push({
        code: 'BRAND_LOOKALIKE',
        severity: 'HIGH',
        title: `Possible ${brandInfo.brand} lookalike or impersonation`,
        detail: `Domain "${hostname}" resembles or references ${brandInfo.brand} but is NOT an official domain (${brandInfo.officialDomains[0]}). Do not enter your PIN, OTP, or account number.`,
      });
    }
  }

  // 6. High-risk TLD check
  const parts = hostname.split('.');
  const tld = parts[parts.length - 1] || '';
  if (HIGH_RISK_TLDS.has(tld)) {
    score += 20;
    findings.push({
      code: 'HIGH_RISK_TLD',
      severity: 'MEDIUM',
      title: `Frequently abused top-level domain (.${tld})`,
      detail: `Domains ending in .${tld} are commonly used in disposable phishing and SMS scam campaigns.`,
    });
  }

  // 7. Excessive subdomain depth
  if (parts.length >= 4) {
    score += 15;
    findings.push({
      code: 'DEEP_SUBDOMAIN',
      severity: 'MEDIUM',
      title: 'Unusually deep subdomain chain',
      detail: 'Multiple nested subdomains are often used to push the true root domain out of mobile address bars.',
    });
  }

  // 8. URL shortener warning
  if (SHORTENER_HOSTS.has(hostname)) {
    score += 20;
    findings.push({
      code: 'URL_SHORTENER',
      severity: 'MEDIUM',
      title: 'Shortened link hides final destination',
      detail: 'Short links obscure the real landing page. Avoid opening shortened links received via unsolicited SMS or WhatsApp.',
    });
  }

  // 9. Urgent phishing path keywords
  const pathLower = `${parsed.pathname}${parsed.search}`.toLowerCase();
  if (/(verify|otp|pin|bonus|reward|prize|unlock|suspend|kyc|claim-cash)/i.test(pathLower)) {
    score += 25;
    findings.push({
      code: 'URGENT_SCAM_KEYWORDS',
      severity: 'MEDIUM',
      title: 'Suspicious verification or reward terms in URL path',
      detail: 'Scam pages frequently lure victims with fake KYC verification, account suspension, or cash bonus claims.',
    });
  }

  // Optional: External Google Safe Browsing v4 check if API key is provided in env
  let threatIntelSource = 'Local heuristic & lookalike domain analyzer (configure SAFE_BROWSING_API_KEY for external feed)';
  const safeBrowsingKey = process.env.SAFE_BROWSING_API_KEY?.trim();

  if (safeBrowsingKey) {
    try {
      const sbResp = await fetch(
        `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(safeBrowsingKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client: { clientId: 'zentrix-android-security', clientVersion: '1.0.0' },
            threatInfo: {
              threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'],
              platformTypes: ['ANDROID', 'ANY_PLATFORM'],
              threatEntryTypes: ['URL'],
              threatEntries: [{ url: parsed.toString() }],
            },
          }),
        }
      );
      if (sbResp.ok) {
        threatIntelSource = 'Local heuristic analyzer + Google Safe Browsing v4';
        const data = (await sbResp.json()) as { matches?: Array<{ threatType: string }> };
        if (data.matches && data.matches.length > 0) {
          score += 75;
          findings.unshift({
            code: 'SAFE_BROWSING_MATCH',
            severity: 'HIGH',
            title: `Flagged by Google Safe Browsing (${data.matches[0].threatType})`,
            detail: 'This URL appears in external threat intelligence databases for phishing or malware distribution.',
          });
        }
      }
    } catch {
      threatIntelSource = 'Local heuristic analyzer (external threat feed temporarily unreachable)';
    }
  }

  const boundedScore = Math.min(100, score);
  let riskLevel: UrlCheckResult['riskLevel'] = 'NO_KNOWN_RED_FLAGS';
  if (boundedScore >= 50) {
    riskLevel = 'HIGH';
  } else if (boundedScore >= 25) {
    riskLevel = 'SUSPICIOUS';
  } else if (boundedScore >= 10) {
    riskLevel = 'CAUTION';
  }

  return {
    normalizedUrl: parsed.toString(),
    hostname,
    riskLevel,
    score: boundedScore,
    findings,
    threatIntelSource,
    limitationsNotice:
      'Automated URL analysis checks structural indicators, lookalike domains, and configured threat feeds. No tool can guarantee 100% detection of newly created phishing sites.',
  };
}
