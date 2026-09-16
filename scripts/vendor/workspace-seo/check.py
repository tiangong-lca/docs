#!/usr/bin/env python3
"""Dependency-free SEO artifact and bounded production verification. See the runbook."""
from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.parse as url
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

MAX_BYTES = 50 * 1024 * 1024
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
XHTML = '{http://www.w3.org/1999/xhtml}'
# A date-only or offset-less lastmod denotes a calendar date, not an instant: its timezone is
# unknown. The most positive real UTC offset is +14:00, so that offset yields the earliest moment
# such a value can denote. A value is only future when even that earliest moment is in the future.
EARLIEST_OFFSET = timezone(timedelta(hours=14))
UNRESERVED = frozenset('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~')


def utcnow():
    return datetime.now(timezone.utc)


def normalize(value):
    parsed = url.urlsplit(value)
    path = url.quote(parsed.path or '/', safe='/%:@!$&\'()*+,;=-._~')
    # Percent-escapes of unreserved characters are equivalent to the literal character (RFC 3986 2.3).
    # Reserved escapes must stay escaped: decoding %2F would change the path structure, and %00 stays
    # escaped so the NUL check in path() still sees it.
    path = re.sub(r'%([0-9a-fA-F]{2})',
                  lambda m: chr(int(m.group(1), 16)) if chr(int(m.group(1), 16)) in UNRESERVED else m[0].upper(),
                  path)
    return url.urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), path, parsed.query, ''))


def origin_of(value):
    p = url.urlsplit(value)
    return f'{p.scheme.lower()}://{p.netloc.lower()}'


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.canonicals, self.alternates, self.links = [], {}, []
        self.ids, self.meta, self.schemas = set(), {}, []
        self.title, self.text = '', ''
        self.in_title = self.in_body = False
        # HTML implies a head before an explicit one appears, so a headless <title> still counts.
        self.in_head = True
        self.hidden = 0
        self.schema = None
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        if tag == 'head':
            self.in_head = True
        if tag == 'body':
            self.in_body = True
            self.in_head = False
        # Only a document title counts. SVG icon markup also uses <title>, and it is not a page title.
        if tag == 'title' and self.in_head and not self.hidden:
            self.in_title = True
        if tag in ('script', 'style', 'svg'):
            self.hidden += 1
        if tag == 'script' and a.get('type', '').lower() == 'application/ld+json':
            self.schema = ''
        if tag == 'meta':
            self.meta.setdefault(a.get('name', a.get('property', '')).lower(), []).append(a.get('content', ''))
        if tag == 'link':
            rel = a.get('rel', '').lower().split()
            if 'canonical' in rel:
                self.canonicals.append(a.get('href', ''))
            if 'alternate' in rel and a.get('hreflang'):
                self.alternates[a['hreflang'].lower()] = a.get('href', '')
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'svg'):
            self.hidden = max(0, self.hidden - 1)
        if tag == 'script' and self.schema is not None:
            self.schemas.append(self.schema)
            self.schema = None
        if tag == 'title':
            self.in_title = False
        if tag == 'head':
            self.in_head = False
        if tag == 'body':
            self.in_body = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.schema is not None:
            self.schema += data
        if self.in_body and not self.hidden:
            self.text += data.strip() + ' '

    @property
    def noindex(self):
        return any(re.search(r'\b(noindex|none)\b', x, re.I)
                   for name in ('robots', 'googlebot', 'bingbot') for x in self.meta.get(name, []))


def schema_objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from schema_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from schema_objects(child)


def finding_id(severity, code, target):
    """Stable identity across runs: deliberately excludes the message, which may be reworded."""
    return hashlib.sha256(f'{severity}|{code}|{target}'.encode()).hexdigest()[:20]


class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, origin):
        self.origin = origin

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if origin_of(newurl) != self.origin:
            raise ValueError('Cross-origin redirect rejected')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Audit:
    def __init__(self, origin, root=None, max_requests=50, timeout=30, sample=12, rotation=0, indexing=True,
                 loopback_preview=False):
        self.origin = origin.rstrip('/')
        parsed = url.urlsplit(self.origin)
        if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username
                or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
            raise ValueError('origin must be an absolute HTTP(S) origin without credentials/path/query')
        self.origin = origin_of(self.origin)
        self.root = Path(root).resolve() if root else None
        self.loopback_preview = loopback_preview
        if loopback_preview and (self.root or parsed.hostname not in ('localhost', '127.0.0.1', '::1')):
            raise ValueError('Preview HTTP checks require an explicit loopback origin and no artifact root')
        self.indexing = indexing and not loopback_preview
        self.max_requests, self.timeout, self.sample, self.rotation = max_requests, timeout, sample, rotation
        self.responses, self.pages, self.entries, self.findings = {}, {}, {}, {}
        self.visited_sitemaps, self.checked_urls = set(), set()
        self.linked_ids = {}
        self.incomplete = False
        self.opener = urllib.request.build_opener(SameOriginRedirect(self.origin))

    def finding(self, severity, code, target, message):
        self.findings[f'{severity}|{code}|{target}'] = dict(id=finding_id(severity, code, target),
                                                            severity=severity, code=code, url=target,
                                                            message=message)

    def path(self, target):
        if origin_of(target) != self.origin:
            raise ValueError('URL outside configured origin')
        decoded = url.unquote(url.urlsplit(target).path)
        if '\x00' in decoded or '\\' in decoded:
            raise ValueError('Invalid path')
        candidate = (self.root / decoded.lstrip('/')).resolve()
        if not candidate.is_relative_to(self.root):
            raise ValueError('Path escapes artifact root')
        if candidate.is_dir():
            candidate = candidate / 'index.html'
        if not candidate.exists() and not candidate.suffix:
            candidate = candidate.with_suffix('.html')
        return candidate

    def read(self, target):
        target = normalize(target)
        cached = self.responses.get(target)
        # An artifact body is dropped from the cache after its first use, so a later read re-reads the
        # real bytes from disk instead of being served empty content.
        if cached is not None and (cached[2] is not None or not self.root):
            return cached
        if origin_of(target) != self.origin:
            raise ValueError('URL outside configured origin')
        if self.root:
            p = self.path(target)
            if not p.is_file():
                response = (404, {}, '', target)
            else:
                if p.stat().st_size > MAX_BYTES:
                    raise ValueError('Artifact exceeds 50 MiB limit')
                response = (200, {}, p.read_text(encoding='utf-8'), target)
        else:
            if len(self.responses) >= self.max_requests:
                raise ValueError('HTTP request budget exhausted')
            request = urllib.request.Request(target, headers={'User-Agent': 'TianGong-SEO-Check/1.0', 'Accept-Encoding': 'identity'})
            started = time.monotonic()
            try:
                stream = self.opener.open(request, timeout=self.timeout)
            except urllib.error.HTTPError as error:
                stream = error
            with stream:
                body = stream.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise ValueError('HTTP response exceeds 50 MiB limit')
                headers = {k.lower(): v for k, v in stream.headers.items()}
                headers['seo-check-duration-ms'] = round((time.monotonic() - started) * 1000)
                response = (stream.status, headers, body.decode('utf-8'), normalize(stream.url))
        # Static HTML embeds Flight data; do not keep a second full copy of every export in RAM.
        self.responses[target] = response if not self.root else (response[0], response[1], None, response[3])
        return response

    def select(self, values, limit):
        values = sorted(values)
        if len(values) <= limit:
            return values
        start = self.rotation * limit % len(values)
        return [values[(start + i) % len(values)] for i in range(limit)]

    @staticmethod
    def trim_fraction(value):
        """Cap sub-microsecond precision; fromisoformat accepted at most six digits before 3.11."""
        return re.sub(r'([.,]\d{6})\d+', r'\1', value)

    @classmethod
    def future_lastmod(cls, value, now):
        """True only when the value cannot yet have occurred anywhere on earth.

        A date-only or offset-less lastmod is a calendar date with an unknown timezone. It has
        already begun somewhere once its earliest possible instant -- at the most positive real
        offset, +14:00 -- is in the past, so the same date is legitimate later in the UTC day than
        it would be under a UTC-midnight reading.
        """
        moment = datetime.fromisoformat(cls.trim_fraction(value).replace('Z', '+00:00'))
        if moment.tzinfo is not None:
            return moment > now
        return moment.replace(tzinfo=EARLIEST_OFFSET) > now

    def sitemap(self, target, depth=0):
        target = normalize(target)
        if target in self.visited_sitemaps:
            self.finding('error', 'sitemap-cycle-or-duplicate', target, 'Sitemap referenced more than once')
            return
        self.visited_sitemaps.add(target)
        if depth > 3 or len(self.visited_sitemaps) > 1024:
            raise ValueError('Sitemap traversal limit exceeded')
        status, headers, body, final = self.read(target)
        if status != 200 or final != target:
            raise ValueError(f'Sitemap requires canonical HTTP 200; got {status} {final}')
        if not self.root and 'xml' not in headers.get('content-type', '').lower():
            raise ValueError('Sitemap has non-XML content type')
        if '<!DOCTYPE' in body.upper() or '<!ENTITY' in body.upper():
            raise ValueError('Sitemap DTD/entity declarations are forbidden')
        tree = ET.fromstring(body)
        if tree.tag not in (NS + 'urlset', NS + 'sitemapindex'):
            raise ValueError('Unexpected sitemap root/namespace')
        if len(tree) > 50_000:
            raise ValueError('Sitemap exceeds 50,000 entries')
        if tree.tag == NS + 'sitemapindex':
            children = [item.findtext(NS + 'loc', '') for item in tree]
            if not children:
                raise ValueError('Empty sitemap index')
            for child in (children if self.root else self.select(children, 2)):
                self.sitemap(child, depth + 1)
            return
        for item in tree:
            location = item.findtext(NS + 'loc', '')
            if origin_of(location) != self.origin or url.urlsplit(location).fragment:
                self.finding('error', 'sitemap-origin', target, f'Invalid/noncanonical loc: {location}')
                continue
            location = normalize(location)
            if location in self.entries:
                self.finding('error', 'sitemap-duplicate-url', location, 'Duplicate loc entry')
            alternates = {}
            for link in item.findall(XHTML + 'link'):
                language, href = link.get('hreflang', '').lower(), link.get('href', '')
                if not language or not href or link.get('rel') != 'alternate' or not url.urlsplit(href).scheme:
                    self.finding('error', 'sitemap-alternate', location, 'Malformed language link')
                elif language in alternates:
                    self.finding('error', 'sitemap-alternate-duplicate', location, language)
                else:
                    alternates[language] = normalize(href)
            modified = item.findtext(NS + 'lastmod')
            if modified:
                try:
                    if self.future_lastmod(modified, utcnow()):
                        raise ValueError('future date')
                except ValueError:
                    self.finding('error', 'lastmod-invalid', location, modified)
            self.entries[location] = alternates

    def page(self, target):
        target = normalize(target)
        if target in self.pages:
            return self.pages[target]
        status, headers, body, final = self.read(target)
        self.checked_urls.add(target)
        if status != 200 or final != target:
            self.finding('error', 'indexable-response', target, f'Expected canonical 200, got {status} {final}')
            return None
        if not self.root and 'html' not in headers.get('content-type', '').lower():
            self.finding('error', 'page-content-type', target, 'Expected HTML')
            return None
        page = Page(body)
        self.pages[target] = page
        noindex = page.noindex or bool(re.search(r'\b(noindex|none)\b', headers.get('x-robots-tag', ''), re.I))
        if self.indexing and noindex:
            self.finding('error', 'sitemap-noindex', target, 'Sitemap includes noindex page')
        if not self.indexing and not noindex:
            self.finding('error', 'nonproduction-indexable', target, 'Nonproduction artifact must carry noindex')
        if len(page.canonicals) != 1 or normalize(page.canonicals[0]) != target:
            self.finding('error', 'canonical', target, 'Expected one absolute self-canonical URL')
        if not page.title.strip():
            self.finding('error', 'title-missing', target, 'Indexable page has no title')
        if not any(x.strip() for x in page.meta.get('description', [])):
            self.finding('warning', 'description-missing', target, 'Needs a useful page description')
        if not page.text.strip():
            self.finding('error', 'html-content-empty', target, 'No initial HTML body text')
        for language, href in page.alternates.items():
            if not url.urlsplit(href).scheme or origin_of(href) != self.origin:
                self.finding('error', 'html-alternate-origin', target, href)
        expected = self.entries.get(target, {})
        actual = {k: normalize(v) for k, v in page.alternates.items()}
        # x-default is optional in either serialization. Real language mappings must agree.
        # HTML and sitemap are alternative supported delivery methods. Compare them only when
        # both provide a language set; a site such as PCR legitimately emits hreflang only in HTML.
        if expected and actual and {k: v for k, v in expected.items() if k != 'x-default'} != {k: v for k, v in actual.items() if k != 'x-default'}:
            self.finding('error', 'language-output-drift', target, 'HTML and sitemap language mappings differ')
        for source in page.schemas:
            try:
                data = json.loads(source)
            except ValueError:
                self.finding('error', 'json-ld-invalid', target, 'JSON-LD is not valid JSON')
                continue
            for obj in schema_objects(data):
                types = obj.get('@type', [])
                types = [types] if isinstance(types, str) else types
                if not isinstance(types, list) or not all(isinstance(t, str) for t in types):
                    self.finding('error', 'json-ld-type-invalid', target, 'JSON-LD @type must be a string or string array')
                    continue
                if 'Dataset' in types:
                    if not isinstance(obj.get('name'), str) or not obj['name'].strip():
                        self.finding('error', 'dataset-name', target, 'Dataset requires a meaningful name')
                    desc = obj.get('description')
                    if not isinstance(desc, str) or not 50 <= len(desc) <= 5000:
                        self.finding('error', 'dataset-description', target, 'Dataset description requires 50–5000 characters')
        # links() later needs only the links and ids; body text and structured-data payloads are the
        # bulk of a large export and are never read again.
        page.text, page.schemas = '', []
        return page

    def relationships(self):
        for target, alternates in self.entries.items():
            real = {k: v for k, v in alternates.items() if k != 'x-default'}
            if real and target not in alternates.values():
                self.finding('error', 'language-self-reference', target, 'Language set must include this URL')
            for language, other in real.items():
                if other not in self.entries:
                    self.finding('error', 'language-target-missing', target, f'{language}: {other} missing from traversed sitemap set')
                elif {k: v for k, v in self.entries[other].items() if k != 'x-default'} != real:
                    self.finding('error', 'language-reciprocity', target, f'Language group differs at {other}')

    def html_relationships(self):
        for target, page in self.pages.items():
            real = {k: normalize(v) for k, v in page.alternates.items() if k != 'x-default'}
            if real and target not in {normalize(v) for v in page.alternates.values()}:
                self.finding('error', 'html-language-self-reference', target, 'HTML language set must include this URL')
            for language, other in real.items():
                if other not in self.entries:
                    self.finding('warning', 'html-language-outside-sitemap', target,
                                 f'{language}: {other} is outside the traversed sitemap set; check availability/index policy')
                if other in self.pages:
                    counterpart = {k: normalize(v) for k, v in self.pages[other].alternates.items() if k != 'x-default'}
                    if counterpart and counterpart != real:
                        self.finding('error', 'html-language-reciprocity', target, f'HTML language group differs at {other}')

    def links(self):
        if not self.root:
            return
        for target, page in list(self.pages.items()):
            for href in page.links:
                other = url.urljoin(target, href)
                if origin_of(other) != self.origin:
                    continue
                fragment = url.unquote(url.urlsplit(other).fragment)
                try:
                    p = self.path(other)
                    if not p.is_file():
                        self.finding('error', 'internal-link-missing', target, f'{href} has no artifact')
                    elif fragment and p.suffix == '.html':
                        key = normalize(other)
                        linked = self.pages.get(key)
                        if linked is not None:
                            ids = linked.ids
                        else:
                            ids = self.linked_ids.get(key)
                            if ids is None:
                                if p.stat().st_size > MAX_BYTES:
                                    raise ValueError('Linked HTML exceeds size limit')
                                ids = self.linked_ids[key] = Page(p.read_text(encoding='utf-8')).ids
                        if fragment not in ids:
                            self.finding('warning', 'internal-fragment-missing', target, f'{href} fragment missing')
                except ValueError as error:
                    self.finding('error', 'internal-link-invalid', target, str(error))

    def run(self, sitemaps=None):
        try:
            if not self.root:
                if self.loopback_preview and not sitemaps:
                    raise ValueError('Preview HTTP checks require explicit sitemap paths')
                robots_url = self.origin + '/robots.txt'
                status, headers, body, final = self.read(robots_url)
                if status != 200 or 'text/plain' not in headers.get('content-type', '').lower():
                    raise ValueError('Production robots.txt requires HTTP 200 text/plain')
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(body.splitlines())
                sitemaps = sitemaps or parser.site_maps()
                if not sitemaps:
                    raise ValueError('No sitemap declared in production robots.txt')
                for bot in ('Googlebot', 'bingbot', 'Baiduspider'):
                    if self.indexing and not parser.can_fetch(bot, self.origin + '/'):
                        self.finding('error', 'robots-blocks-home', robots_url, f'{bot} cannot fetch homepage')
                    elif not self.indexing and parser.can_fetch(bot, self.origin + '/'):
                        self.finding('error', 'preview-robots-allows-home', robots_url, f'Preview unexpectedly permits {bot}')
            for sitemap in sitemaps or [self.origin + '/sitemap.xml']:
                self.sitemap(url.urljoin(self.origin + '/', sitemap))
            if not self.entries:
                raise ValueError('No indexable sitemap URLs found')
            self.relationships()
            selected = sorted(self.entries) if self.root else self.select(self.entries, self.sample)
            for target in selected:
                if not self.root and self.indexing and not parser.can_fetch('Googlebot', target):
                    self.finding('error', 'robots-blocks-page', target, 'Googlebot cannot fetch sitemap URL')
                self.page(target)
            self.html_relationships()
            self.links()
        except (ValueError, OSError, UnicodeError, ET.ParseError, http.client.HTTPException) as error:
            self.incomplete = True
            self.finding('error', 'check-incomplete', self.origin, str(error))
        findings = sorted(self.findings.values(), key=lambda x: (x['severity'], x['code'], x['url']))
        return dict(schema=1, origin=self.origin,
                    mode='artifact' if self.root else 'loopback-preview' if self.loopback_preview else 'live-sample',
                    complete=not self.incomplete, generated_at=datetime.now(timezone.utc).isoformat(),
                    sitemap_files=len(self.visited_sitemaps), sitemap_urls=len(self.entries),
                    checked_urls=sorted(self.checked_urls), requests=len(self.responses),
                    counts=dict(Counter(x['severity'] for x in findings)), findings=findings)


def changes(current, previous):
    if current['origin'] != previous.get('origin') or current['mode'] != previous.get('mode'):
        raise ValueError('Previous report belongs to a different origin/mode')
    old = {x['id']: x for x in previous.get('findings', [])}
    new = {x['id']: x for x in current['findings']}
    checked = set(current['checked_urls'])
    resolved = [key for key, value in old.items() if key not in new and value['url'] in checked]
    return dict(new=sorted(new.keys() - old.keys()), continuing=sorted(new.keys() & old.keys()),
                resolved=sorted(resolved) if current['complete'] else [])


def sanitize(error):
    """Keep reportable text free of credentials: strip URL userinfo, keep the rest short."""
    message = f'{type(error).__name__}: {error}'
    return re.sub(r'([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]*@', r'\1', message)[:200]


def incomplete_report(mode, origin, message):
    return dict(schema=1, origin=origin, mode=mode, complete=False, generated_at=utcnow().isoformat(),
                sitemap_files=0, sitemap_urls=0, checked_urls=[], requests=0, counts={'error': 1},
                findings=[dict(id=finding_id('error', 'check-incomplete', origin), severity='error',
                               code='check-incomplete', url=origin, message=message)])


def sort_findings(result):
    result['findings'].sort(key=lambda x: (x['severity'], x['code'], x['url']))
    result['counts'] = dict(Counter(x['severity'] for x in result['findings']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--root', help='Existing static export; omit for bounded production HTTP')
    parser.add_argument('--sitemap', action='append')
    parser.add_argument('--sample', type=int, default=12)
    parser.add_argument('--rotation', type=int, default=0)
    parser.add_argument('--max-requests', type=int, default=50)
    parser.add_argument('--timeout', type=int, default=30)
    parser.add_argument('--output', required=True)
    parser.add_argument('--previous')
    parser.add_argument('--loopback-preview', action='store_true',
                        help='Assert noindex/disallow against an existing loopback test server; requires explicit --sitemap')
    parser.add_argument('--artifact-indexing', choices=('enabled', 'disabled'), default='enabled',
                        help='Expected page directives for a static CI export; production is always enabled')
    args = parser.parse_args()
    if not 1 <= args.sample <= 100 or not 1 <= args.max_requests <= 200 or not 1 <= args.timeout <= 60 or args.rotation < 0:
        parser.error('Require sample 1–100, requests 1–200, timeout 1–60 and nonnegative rotation')
    if not args.root and args.artifact_indexing != 'enabled':
        parser.error('disabled indexing is only supported for explicit static CI artifacts')
    mode = 'artifact' if args.root else 'loopback-preview' if args.loopback_preview else 'live-sample'
    # Every failure below still writes a report and exits 2. Only Exception is caught, so an
    # interrupt or SystemExit is never converted into a report.
    try:
        audit = Audit(args.origin, args.root, args.max_requests, args.timeout, args.sample, args.rotation,
                      args.artifact_indexing == 'enabled', args.loopback_preview)
    except Exception as error:
        result = incomplete_report(mode, '<unvalidated>', f'Invalid check configuration: {sanitize(error)}')
    else:
        try:
            result = audit.run(args.sitemap)
        except Exception as error:
            result = incomplete_report(mode, audit.origin, f'Check aborted: {sanitize(error)}')
        if args.previous:
            try:
                result['changes'] = changes(result, json.loads(Path(args.previous).read_text()))
            except Exception as error:
                result['complete'] = False
                entry = dict(id=finding_id('error', 'check-incomplete', result['origin']), severity='error',
                             code='check-incomplete', url=result['origin'],
                             message=f'Previous report unusable: {sanitize(error)}')
                # Replace, never duplicate, an incomplete finding the audit already recorded.
                result['findings'] = [f for f in result['findings'] if f['id'] != entry['id']] + [entry]
                sort_findings(result)
    try:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_name(output.name + '.tmp')
        temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        temporary.replace(output)
    except OSError as error:
        print(f'Report not written: {sanitize(error)}', file=sys.stderr)
        return 2
    print(json.dumps({k: v for k, v in result.items() if k not in ('findings', 'checked_urls')}, ensure_ascii=False))
    return 2 if not result['complete'] else 1 if result['counts'].get('error') else 0


if __name__ == '__main__':
    sys.exit(main())
