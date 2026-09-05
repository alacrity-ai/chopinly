// Builds the five document pages from one shell so header, footer and voice stay identical.
//   node dev/build-legal.mjs   → about.html privacy.html terms.html cookies.html disclaimer.html
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const EFFECTIVE = "September 5, 2026";
const CO = "LaLa Solutions LLC";
const MAIL = "leif@lalalimited.com";
const ADDRESS = "LaLa Solutions LLC, c/o ZenBusiness Inc., 611 South DuPont Highway, Suite 102, Dover, DE 19901, USA";
const PAGES = [
  { slug: "about", title: "About", nav: "about" },
  { slug: "privacy", title: "Privacy Policy", nav: "privacy" },
  { slug: "terms", title: "Terms of Service", nav: "terms" },
  { slug: "cookies", title: "Cookie Policy", nav: "cookies" },
  { slug: "disclaimer", title: "Disclaimer", nav: "disclaimer" },
];
const nav = (cur) => PAGES.map((p) => `<a href="/${p.slug}" ${p.slug === cur ? 'aria-current="page"' : ""}>${p.nav}</a>`).join("\n      ");

function shell({ slug, title, description, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title} — Chopinly</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="https://chopinly.com/${slug}">
  <meta property="og:title" content="${title} — Chopinly">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://chopinly.com/${slug}">
  <meta property="og:image" content="https://chopinly.com/og/chopinly.png">
  <meta name="theme-color" content="#191410">
  <link rel="icon" href="/icons/icon-192.png" type="image/png">
  <link rel="preload" href="/fonts/fraunces-roman.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/fraunces-italic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/legal.css">
</head>
<body>
  <header class="l-top">
    <a class="l-brand" href="/welcome" aria-label="Chopinly"><img src="/icons/icon-192.png" alt="" width="32" height="32"><span>Chopinly</span></a>
    <nav class="l-nav" aria-label="documents">
      ${nav(slug)}
    </nav>
  </header>
  <main class="l-doc">
${body}
  </main>
  <footer class="l-foot">
    <span>Chopinly · made by ${CO}</span>
    <nav aria-label="more">
      <a href="/welcome">home</a>
      <a href="/?app=1">open the app</a>
      ${nav("")}
      <a href="mailto:${MAIL}">contact</a>
    </nav>
  </footer>
</body>
</html>
`;
}
const meta = (extra = "") => `<p class="l-meta">Effective ${EFFECTIVE} · ${CO}${extra}</p>`;

// ---------------------------------------------------------------------------
const about = `
    <h1>About Chopinly</h1>
    ${meta("")}
    <p>Chopinly is a free practice assistant for musicians. You press play, say what you're working on, and it keeps an honest record of your practice: minutes on each piece and technique, a notes thread per goal, a calendar that shows the shape of your months, and an analytics page that tells you how you really spend your time. It also carries the tools you reach for while practicing: a metronome, a tuner, a pitch pipe and sight-singing books.</p>

    <h2>What we believe</h2>
    <ul>
      <li><b>Free, and no ads.</b> Chopinly costs nothing, shows nothing, and sells nothing to anyone.</li>
      <li><b>Local first.</b> The app works fully on your device with no account. Your practice data lives in your browser until you choose to back it up.</li>
      <li><b>Your data is yours.</b> An account exists only to back up and sync your practice. You can download everything or delete everything with one tap, any time. We never sell, share, or train models on it.</li>
      <li><b>No tracking.</b> No analytics scripts, no advertising cookies, no fingerprinting, no third-party code on the page. See the <a href="/privacy">Privacy Policy</a> and <a href="/cookies">Cookie Policy</a>.</li>
      <li><b>Honest numbers.</b> Every figure you see is derived from the segments you logged. Nothing is inflated, gamified against you, or hidden behind a paywall.</li>
    </ul>

    <h2>Who makes it</h2>
    <p>Chopinly is made and operated by <b>${CO}</b>, a Delaware (USA) limited liability company. Registered address: ${ADDRESS}. You can reach us at <a href="mailto:${MAIL}">${MAIL}</a>. We read every message.</p>

    <h2>In the case</h2>
    <ul>
      <li><b>Logbook</b> — goals, the practice clock, notes, today, history.</li>
      <li><b>Analytics</b> — any range; by composer, work and type; time of day, weekdays, session length.</li>
      <li><b>Metronome</b> — a pendulum on the Web Audio clock, with subdivisions and tempo markings; stamps a tempo onto the goal you're practicing.</li>
      <li><b>Tuner</b> and <b>pitch pipe</b> — hear where you are; any note, any octave.</li>
      <li><b>Sight singing</b> — graded melodies, sung back and judged; finished runs land in the logbook by themselves.</li>
    </ul>

    <h2>The source code and its license</h2>
    <p>Chopinly's source code is licensed under the <b>Elastic License 2.0</b> (ELv2). In plain English: you may use, copy, modify and self-host the software and build things on top of it, for any purpose, free of charge. The one thing you may not do is offer Chopinly itself, or a substantially similar fork, to other people as a hosted or managed service. The full license text, with a longer plain-English summary, is at <a href="/LICENSE.md">chopinly.com/LICENSE.md</a>. The legal text governs.</p>
    <p>The license covers the <em>code</em>. Your use of the hosted service at chopinly.com is governed by the <a href="/terms">Terms of Service</a>.</p>

    <h2>Trademarks</h2>
    <p>"Chopinly" and the Chopinly mark are trademarks of ${CO}. The software license grants no rights to them; forks must use a different name.</p>

    <h2>The documents</h2>
    <ul>
      <li><a href="/privacy">Privacy Policy</a> — what we hold, why, for how long, and how you control it.</li>
      <li><a href="/terms">Terms of Service</a> — the deal for using the hosted service.</li>
      <li><a href="/cookies">Cookie Policy</a> — the one cookie, the browser storage, and why there is no banner.</li>
      <li><a href="/disclaimer">Disclaimer</a> — what Chopinly is not: a teacher, a doctor, or a guarantee.</li>
    </ul>
`;

// ---------------------------------------------------------------------------
const privacy = `
    <h1>Privacy Policy</h1>
    ${meta(" (the data controller)")}
    <aside class="l-summary" aria-label="summary">
      <h2>In plain English</h2>
      <ul>
        <li><b>Without an account, your practice data stays on your device.</b> We never see it.</li>
        <li><b>With an account, we store your email address and the practice data you back up.</b> That is the whole list.</li>
        <li><b>No analytics, no ads, no trackers, no third-party scripts.</b> One strictly necessary cookie, set only when you sign in.</li>
        <li><b>We do not sell, share, rent, or train models on your data.</b> Not now, not later without asking you first.</li>
        <li><b>Two companies help us run it:</b> Cloudflare (servers and database) and Mailgun (delivering the sign-in email). Nobody else.</li>
        <li><b>You are in control, in the app:</b> download everything, delete everything, sign out anywhere — buttons, not request forms.</li>
      </ul>
    </aside>

    <h2>1. Who we are</h2>
    <p>Chopinly (chopinly.com and the installable app) is operated by <b>${CO}</b>, a Delaware limited liability company ("we", "us"). For the purposes of the EU and UK General Data Protection Regulation (GDPR) we are the <b>data controller</b> for the personal data described here.</p>
    <p>Contact: <a href="mailto:${MAIL}">${MAIL}</a> · Postal: ${ADDRESS}. We have not appointed a Data Protection Officer because the law does not require one for a service of this size and kind; the email above reaches the person responsible.</p>

    <h2>2. Two ways to use Chopinly</h2>
    <h3>Without an account</h3>
    <p>Everything — your goals, practice segments, notes, preferences — is stored in your browser on your device (localStorage and the browser's cache). It is never sent to us. The only thing that reaches our servers is what any website receives when you open it: your browser asks for the app's files (HTML, scripts, styles, fonts, icons). Those requests pass through Cloudflare, which processes your IP address and request headers to deliver and protect the site (see §6 and §7). We run no analytics of any kind.</p>
    <h3>With an account</h3>
    <p>If you sign in, we store the items in §3 so that your practice is backed up and available on your other devices. Signing in is optional and reversible: sign out keeps your data on the device, <em>delete account</em> removes it from our servers.</p>

    <h2>3. What we hold when you have an account</h2>
    <div class="l-table-wrap"><table>
      <thead><tr><th>Data</th><th>What exactly</th><th>Why</th><th>Kept</th></tr></thead>
      <tbody>
        <tr><td><b>Email address</b></td><td>The address you sign in with.</td><td>To identify your account and send you sign-in codes.</td><td>Until you delete your account.</td></tr>
        <tr><td><b>Practice data</b></td><td>Goals (name, optional composer, type, status), practice segments (start and end times, optional tempo), notes you write, and deletion markers so devices agree.</td><td>Backup and sync — the service you asked for.</td><td>Until you delete the item or your account.</td></tr>
        <tr><td><b>Session records</b></td><td>One per signed-in device: a random token stored only as a SHA-256 hash, created / renewed / expiry timestamps, and the browser's user-agent string (cut to 200 characters).</td><td>To keep you signed in and let you see and end sessions.</td><td>180 days from last use, or until you sign out.</td></tr>
        <tr><td><b>Sign-in codes</b></td><td>A salted hash of the six-digit code, the email it was sent to, an attempt counter.</td><td>To verify it is you.</td><td>10 minutes, or until used.</td></tr>
        <tr><td><b>Rate-limit counters</b></td><td>A count of recent requests keyed by your email address and by the IP address of the request.</td><td>To stop abuse — someone hammering the sign-in or sync endpoints.</td><td>One hour.</td></tr>
      </tbody>
    </table></div>
    <p>There are no passwords: Chopinly signs you in with a one-time code sent to your email. We hold no payment details because there is nothing to pay for. We do not ask for your name, age, location, or anything about you beyond the email address.</p>

    <h2>4. What we never do</h2>
    <ul>
      <li>No analytics, advertising, or tracking of any kind — no Google Analytics, no pixels, no fingerprinting, no session recording.</li>
      <li>No third-party scripts on our pages. Everything the browser runs is ours and served from chopinly.com.</li>
      <li>No selling, renting, or sharing of personal data with anyone for their own purposes. No data brokers, no "partners".</li>
      <li>No use of your practice data to train machine-learning or AI models.</li>
      <li>No marketing email. The only messages we send are the sign-in code you requested and, rarely, a notice that materially affects your account (for example a change to these terms or a shutdown, see the <a href="/terms">Terms</a>).</li>
      <li>No profiling or automated decisions about you.</li>
    </ul>

    <h2>5. Why we process your data, and the legal bases</h2>
    <ul>
      <li><b>To provide the account you asked for</b> — storing, backing up and syncing your practice, signing you in. Legal basis: performance of a contract with you (GDPR Art. 6(1)(b)).</li>
      <li><b>To keep the service secure and working</b> — rate limits, abuse prevention, debugging failures. Legal basis: our legitimate interest in running a safe service (Art. 6(1)(f)), which we have weighed against your interests and which involves only the minimal data in §3.</li>
      <li><b>To comply with the law</b> if we are ever legally required to. Legal basis: legal obligation (Art. 6(1)(c)).</li>
    </ul>
    <p>We do not rely on consent for anything today. If we ever add an optional feature that needs it, we will ask you clearly first and you can say no.</p>

    <h2>6. Who else sees your data</h2>
    <p>Two service providers ("processors") handle data on our behalf, under contracts that limit them to providing their service to us:</p>
    <ul>
      <li><b>Cloudflare, Inc.</b> (USA) — hosts the app, runs the database that stores account data, and sits in front of the site as a content-delivery and security network. Cloudflare processes request metadata (IP address, headers, URL, timestamp) to serve and protect the site and keeps standard, short-lived server logs. <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">Cloudflare's privacy policy</a>.</li>
      <li><b>Mailgun</b> (Sinch, USA) — delivers the sign-in email. It receives your email address and the message containing your code. <a href="https://www.mailgun.com/legal/privacy-policy/" rel="noopener">Mailgun's privacy policy</a>.</li>
    </ul>
    <p>We disclose personal data to no one else, except if compelled by a valid legal process — and then only what is required, and we will tell you unless the law forbids it. If ${CO} were ever acquired, this policy would still bind the data, and you would be told before anything changed.</p>

    <h2>7. Where your data is processed</h2>
    <p>We are a US company and our processors are US companies. Account data is stored on Cloudflare's infrastructure, primarily in the United States; Cloudflare's global network may handle your requests at the data center nearest you. If you are in the EEA, the UK or Switzerland, transfers to the US rely on the EU–US Data Privacy Framework (and its UK and Swiss extensions) where the recipient is certified, and otherwise on Standard Contractual Clauses in our processors' data-processing terms. By using an account you understand that your data is processed in the United States.</p>

    <h2>8. How long we keep it</h2>
    <p>Each item's retention is in the table in §3. In addition: our database keeps a rolling 30-day history for disaster recovery, so deleted data leaves that history within 30 days. Cloudflare's server logs are kept for its own short operational window. When you delete your account we delete your practice data, sessions, codes and the account record immediately in one operation.</p>

    <h2>9. Your rights, and where the buttons are</h2>
    <p>Whether or not GDPR applies to you, you have these rights over your data, and most of them are a tap away in the app (the account button in the header):</p>
    <ul>
      <li><b>Access and portability</b> — <em>download my data</em> gives you everything we hold, as a file you can keep or import elsewhere.</li>
      <li><b>Rectification</b> — edit any goal, note or segment in the app; the correction syncs.</li>
      <li><b>Erasure</b> — <em>delete account</em> removes everything from our servers at once. <em>Sign out &amp; clear this device</em> removes the local copy too.</li>
      <li><b>Restriction and objection</b> — sign out to stop all processing while keeping your account, or email us.</li>
      <li><b>Withdrawal of consent</b> — not applicable today, since nothing rests on consent; if that changes, withdrawing will be as easy as giving it.</li>
      <li><b>Complaint</b> — you may complain to your local data-protection authority (in the EU, see the <a href="https://www.edpb.europa.eu/about-edpb/about-edpb/members_en" rel="noopener">list of supervisory authorities</a>; in the UK, the ICO). We would appreciate the chance to help first.</li>
    </ul>
    <p>For anything you can't do in the app, email <a href="mailto:${MAIL}">${MAIL}</a>. We answer within 30 days, free of charge. We verify requests through the email address on the account.</p>

    <h2>10. Security</h2>
    <p>All traffic is encrypted in transit (TLS). Session tokens are stored only as hashes; sign-in codes are salted and hashed, expire in ten minutes, and allow five attempts. There are no passwords to leak. The session cookie is HttpOnly, Secure and SameSite, and every state-changing request checks its origin. Requests are rate-limited. We collect as little as the service needs, which is the best security measure of all. No system is perfect: if we learn of a breach affecting your personal data we will notify you and, where required, the relevant authority without undue delay.</p>

    <h2>11. Children</h2>
    <p>Chopinly is not directed at children under 13, and an account requires you to be 16 or older, or to have a parent's or guardian's permission. We do not knowingly collect personal data from children; if you believe a child has created an account, email us and we will delete it.</p>

    <h2>12. California and other US state privacy laws</h2>
    <p>We do not sell personal information, do not "share" it for cross-context behavioral advertising, and do not collect sensitive personal information. We honor requests to know, delete and correct as described in §9, and we will never treat you differently for exercising a right. We do not respond to "Do Not Track" signals because we do not track.</p>

    <h2>13. Changes to this policy</h2>
    <p>If we change this policy we will post the new version here with a new effective date. If a change materially affects account holders, we will tell you by email or in the app at least 14 days before it takes effect.</p>

    <h2>14. Contact</h2>
    <p>${CO} · <a href="mailto:${MAIL}">${MAIL}</a> · ${ADDRESS}</p>
`;

// ---------------------------------------------------------------------------
const terms = `
    <h1>Terms of Service</h1>
    ${meta("")}
    <aside class="l-summary" aria-label="summary">
      <h2>In plain English</h2>
      <ul>
        <li>Chopinly is free. Use it as much as you like, for your own practice.</li>
        <li>What you put in is yours. We only hold it to back it up and sync it for you.</li>
        <li>Don't abuse the service or try to resell it as your own hosted product.</li>
        <li>It is provided as-is. We work hard on it, but a free app can't come with guarantees.</li>
        <li>If we ever had to shut it down we would tell you at least 30 days ahead and keep the download button working until then.</li>
      </ul>
    </aside>
    <p>These Terms govern your use of Chopinly — the web app and installable app at chopinly.com and the account service behind it (the "Service"), operated by <b>${CO}</b>, a Delaware limited liability company ("we", "us"). By using the Service you agree to these Terms and to the <a href="/privacy">Privacy Policy</a>. If you do not agree, please don't use the Service.</p>

    <h2>1. What Chopinly is</h2>
    <p>Chopinly is a practice assistant for musicians: a practice clock attributed to goals, notes, a history and analytics, plus a metronome, tuner, pitch pipe and sight-singing books. It runs in your browser and works without an account. An optional account backs your practice up and syncs it between your devices.</p>

    <h2>2. Who may use it</h2>
    <p>Anyone may use the app without an account. To create an account you must be at least 16 years old, or have a parent's or guardian's permission, and be able to enter into this agreement. If you use Chopinly on behalf of a school or organization, you confirm you are allowed to accept these Terms for it.</p>

    <h2>3. Your account</h2>
    <p>You sign in with a one-time code sent to your email address; there is no password. You are responsible for keeping your email account and your devices secure, and for what happens under your account until you sign out. Tell us at <a href="mailto:${MAIL}">${MAIL}</a> if you believe someone else has access. You may sign out of any device, download your data, or delete your account at any time from the account button in the app.</p>

    <h2>4. Acceptable use</h2>
    <p>Please don't: break the law; probe, scan, overload or disrupt the Service or other people's accounts; access the Service with automated tools other than the app itself in a way that imposes unreasonable load; try to get at other users' data; upload content you have no right to store or that is unlawful; or offer the hosted Service, or a substantially equivalent copy of it, to third parties as your own product. We apply technical limits (for example, rate limits and size limits) to protect the Service; they are designed to be invisible in ordinary use.</p>

    <h2>5. Your content is yours</h2>
    <p>You own the practice data, notes and everything else you put into Chopinly. You grant us only the limited license needed to store, back up, sync, transmit and display it to you and your other devices in order to provide the Service. That license ends when you delete the content or your account. We do not sell your content, share it with anyone for their purposes, or use it to train machine-learning models.</p>

    <h2>6. The Service is free, and provided as it is</h2>
    <p>Chopinly costs nothing and shows no advertising. We may add, change or remove features over time. We operate the Service with care — including database backups and managed infrastructure — but it comes with no uptime guarantee. <b>If we ever decide to end the hosted Service, we will give account holders at least 30 days' notice by email and in the app, and the download button will keep working through that period so you can take your data with you.</b> After that, remaining account data is deleted.</p>

    <h2>7. The code and the Service are licensed differently</h2>
    <p>Chopinly's source code is licensed under the <a href="/LICENSE.md">Elastic License 2.0</a>, which lets you use, modify, self-host and build on the software but not offer it to others as a hosted service. That license governs the code. These Terms govern your use of the hosted Service at chopinly.com. "Chopinly" and the Chopinly mark are our trademarks and are not licensed by either.</p>

    <h2>8. Disclaimer of warranties</h2>
    <p>The Service is provided "as is" and "as available", without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy and non-infringement. Chopinly is a tool, not a teacher or a health professional; see the <a href="/disclaimer">Disclaimer</a>. Some jurisdictions do not allow certain warranty exclusions, so some of this may not apply to you.</p>

    <h2>9. Limitation of liability</h2>
    <p>To the fullest extent permitted by law, we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost data, lost profits or goodwill, arising out of or relating to the Service. Because the Service is free, our total liability to you for any claim relating to it is limited to fifty US dollars (USD 50) or the smallest amount permitted by law, whichever is greater. Nothing in these Terms limits liability that cannot be limited by law, including for gross negligence, willful misconduct, or, where you are a consumer, rights that your local law gives you and does not allow to be waived.</p>

    <h2>10. Your responsibility to us</h2>
    <p>You will hold us harmless from claims by third parties that arise from content you store in the Service or from your breach of these Terms.</p>

    <h2>11. Ending things</h2>
    <p>You can stop using Chopinly at any time, and delete your account in the app; deletion is immediate. We may suspend or close an account that breaks these Terms or threatens the Service or other users; where reasonable we will warn you first, and you can always ask for your data.</p>

    <h2>12. Governing law and disputes</h2>
    <p>These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-law rules. Disputes will be resolved in the state or federal courts located in Delaware, and each of us waives any right to take part in a class action. If you are a consumer in the European Union, the United Kingdom or elsewhere with mandatory consumer-protection rules, nothing here takes away the protections of the law of your country of residence or your right to bring a claim in your local courts.</p>

    <h2>13. Changes to these Terms</h2>
    <p>We may update these Terms. Material changes will be announced by email to account holders or in the app at least 14 days before they take effect; the effective date at the top will change. Continuing to use the Service after that date means you accept the new Terms.</p>

    <h2>14. The whole agreement</h2>
    <p>These Terms, together with the <a href="/privacy">Privacy Policy</a>, <a href="/cookies">Cookie Policy</a> and <a href="/disclaimer">Disclaimer</a>, are the entire agreement between you and us about the Service. If any part is found unenforceable, the rest stands. You may not transfer this agreement; we may transfer it in connection with a merger or sale, and you would be told.</p>

    <h2>15. Contact</h2>
    <p>${CO} · <a href="mailto:${MAIL}">${MAIL}</a> · ${ADDRESS}</p>
`;

// ---------------------------------------------------------------------------
const cookies = `
    <h1>Cookie Policy</h1>
    ${meta("")}
    <aside class="l-summary" aria-label="summary">
      <h2>In plain English</h2>
      <ul>
        <li>Chopinly sets <b>one cookie</b>, and only after you sign in. It keeps you signed in. That is all it does.</li>
        <li>There are <b>no analytics, advertising or third-party cookies</b>, and nothing that follows you to other sites.</li>
        <li>The app keeps your practice data and its own files in your browser's storage so it works offline. That storage never leaves your device.</li>
        <li>Because everything here is strictly necessary, the law does not require a consent banner — and we would rather not interrupt you with one.</li>
      </ul>
    </aside>

    <h2>1. The one cookie</h2>
    <div class="l-table-wrap"><table>
      <thead><tr><th>Name</th><th>Purpose</th><th>Set when</th><th>Lifetime</th><th>Type</th></tr></thead>
      <tbody>
        <tr><td><code>chopinly_session</code></td><td>Identifies your signed-in session so the app can back up and sync your practice. Contains a random token; carries no personal information itself.</td><td>Only when you sign in with an email code.</td><td>180 days, renewed while you keep using the app; removed when you sign out or delete your account.</td><td>Strictly necessary, first-party. HttpOnly, Secure, SameSite=Lax.</td></tr>
      </tbody>
    </table></div>
    <p>If you never sign in, Chopinly sets no cookies at all.</p>

    <h2>2. Browser storage the app uses</h2>
    <ul>
      <li><b>localStorage</b> — your goals, practice segments and notes (when you use the app without an account, this <em>is</em> your data), plus small preferences: which tool you had open, the analytics range you picked, whether you have seen the landing page.</li>
      <li><b>Cache Storage (service worker)</b> — copies of the app's own files (scripts, styles, fonts, icons) so Chopinly opens instantly and works offline.</li>
    </ul>
    <p>Both are first-party, stay on your device, and are never read by us. They are what makes the app work; they are not used to track you.</p>

    <h2>3. What we don't use</h2>
    <p>No analytics cookies or scripts, no advertising or remarketing cookies, no social-media buttons or embeds, no A/B-testing tools, no cross-site tracking of any kind. Chopinly's pages load no third-party code.</p>

    <h2>4. Why there is no cookie banner</h2>
    <p>European ePrivacy rules and the guidance of data-protection authorities exempt storage that is strictly necessary to provide a service the user asked for — a session cookie that keeps you signed in, and the local storage an app needs to work — from the consent requirement. Everything Chopinly stores falls in that category. Showing a banner would add friction without adding a choice. If we ever wanted to add a non-essential cookie, we would ask you first, before it is set, and update this page.</p>

    <h2>5. Our hosting provider</h2>
    <p>Chopinly is served through Cloudflare. Cloudflare's security systems can, in rare cases when they detect automated traffic, set a strictly necessary cookie of their own (for example <code>__cf_bm</code>) to tell people from bots and keep the site up. These are not used for anything else, and we have no other Cloudflare features that set cookies enabled.</p>

    <h2>6. How to clear everything</h2>
    <p>In the app: <em>sign out</em> removes the session cookie and keeps your local data; <em>sign out &amp; clear this device</em> removes both. Your browser's settings can also clear cookies and site data for chopinly.com at any time. Clearing local data on a device without an account deletes the only copy of your practice on that device — download it first if you want to keep it.</p>

    <h2>7. Changes</h2>
    <p>If this policy changes we will post the new version here with a new effective date, and — if the change means a new cookie — ask before setting it.</p>

    <h2>8. Contact</h2>
    <p>${CO} · <a href="mailto:${MAIL}">${MAIL}</a>. See also the <a href="/privacy">Privacy Policy</a>.</p>
`;

// ---------------------------------------------------------------------------
const disclaimer = `
    <h1>Disclaimer</h1>
    ${meta("")}
    <aside class="l-summary" aria-label="summary">
      <h2>In plain English</h2>
      <ul>
        <li>Chopinly is a practice tool. It is not a teacher, a doctor, or a physiotherapist.</li>
        <li>The colors and words about "healthy" amounts of practice are general guidance, not medical advice. Pain means stop and ask a professional — whatever the calendar says.</li>
        <li>The numbers are your entries, faithfully added up. They measure time, not skill.</li>
        <li>Your device holds your data unless you back it up. Please back it up.</li>
      </ul>
    </aside>

    <h2>1. Not a teacher</h2>
    <p>Chopinly records and organizes your practice. It does not evaluate your playing, prescribe what to practice, or replace a teacher, a coach or your own judgment. Suggestions in the app (such as which goal you practiced last) are conveniences, not instruction.</p>

    <h2>2. Not medical advice</h2>
    <p>The History calendar colors each day by how long you practiced, and the app describes some amounts as a "sweet spot", "diminishing" or "too much". Those bands are general guidance drawn from published research on deliberate practice and on playing-related injury in musicians. They are not medical advice, they are not tailored to you, and they do not account for your age, health, instrument, technique or history. Discomfort, pain, numbness or tingling while playing are reasons to stop and consult a qualified professional regardless of what any chart shows. Nothing in Chopinly diagnoses, treats or prevents any condition.</p>

    <h2>3. The numbers are your entries</h2>
    <p>Every figure — minutes, streaks, shares by composer, session lengths, analytics — is calculated from the segments you started, stopped, added or edited, and from what other tools in the app logged with your knowledge. The app cannot know whether you were at the instrument, whether the time was well spent, or whether you forgot to press stop. Treat the numbers as a record of what you logged, not as a measure of ability or a promise of progress.</p>

    <h2>4. The tools have limits</h2>
    <p>The metronome keeps time on your browser's audio clock; the tuner and pitch pipe depend on your device's microphone and speakers and on the room; the sight-singing judge estimates pitch and rhythm from a microphone signal. They are practical aids of good but ordinary accuracy, not calibrated instruments, and their results can be affected by hardware, noise and browser behavior.</p>

    <h2>5. Your data lives on your device unless you back it up</h2>
    <p>Chopinly is local-first: without an account, the only copy of your practice history is in your browser on your device. Clearing browser data, losing or replacing the device, or a browser deciding to evict site storage will delete it, and we cannot recover it. Use <em>download my data</em> for a file copy, or sign in so it is backed up. Even with an account, keep your own export if the history matters to you.</p>

    <h2>6. Availability</h2>
    <p>We aim to keep the Service running smoothly, but it is a free service provided as-is and may be interrupted, changed or discontinued as described in the <a href="/terms">Terms of Service</a>. The app is designed to keep working offline with what is on your device.</p>

    <h2>7. No professional advice of any kind</h2>
    <p>Nothing on chopinly.com or in the app is legal, medical, financial or other professional advice. Content is provided for general information and for your own use in organizing practice.</p>

    <h2>8. Questions</h2>
    <p>${CO} · <a href="mailto:${MAIL}">${MAIL}</a>. See also the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
`;

const DOCS = {
  about: { title: "About", description: "Chopinly is a free, ad-free, local-first practice assistant for musicians, made by LaLa Solutions LLC. Who makes it, what we believe, and the Elastic License 2.0.", body: about },
  privacy: { title: "Privacy Policy", description: "What Chopinly holds (an email and the practice you choose to back up), why, for how long, who helps us run it, and the buttons that let you download or delete everything. No analytics, no ads, no sharing. GDPR and CCPA.", body: privacy },
  terms: { title: "Terms of Service", description: "The deal for using Chopinly's free hosted service: your content is yours, use it kindly, provided as-is, 30 days' notice and an export window if it ever ends.", body: terms },
  cookies: { title: "Cookie Policy", description: "Chopinly sets one strictly necessary cookie, only when you sign in, and uses browser storage so the app works offline. No analytics, no advertising cookies, no banner needed.", body: cookies },
  disclaimer: { title: "Disclaimer", description: "Chopinly is a practice tool, not a teacher or a doctor. Practice bands are general guidance, numbers are your entries, and your device holds your data unless you back it up.", body: disclaimer },
};
for (const [slug, d] of Object.entries(DOCS)) {
  writeFileSync(join(ROOT, `${slug}.html`), shell({ slug, ...d }));
  console.log(`wrote ${slug}.html`);
}
